const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool } = require('../lib/db');

// UUID 형식 보장 헬퍼 (PostgreSQL UUID 타입 컬럼 호환)
function toUuid(id) {
  if (!id) return crypto.randomUUID();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return id;
  const hash = crypto.createHash('md5').update(String(id)).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    'a' + hash.substring(17, 20),
    hash.substring(20, 32)
  ].join('-');
}

// 사용자 실제 user_profiles ID(UUID) 조회 및 미존재 시 생성 헬퍼
async function resolveUserUuid(rawUserId) {
  if (!rawUserId) return null;
  const cleanId = String(rawUserId).trim();

  // 1. UUID 형식인 경우 직접 조회
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(cleanId)) {
    const res = await pool.query('SELECT id FROM user_profiles WHERE id = $1 LIMIT 1', [cleanId]);
    if (res.rows.length > 0) return res.rows[0].id;
  }

  // 2. login_id 또는 email 로 조회
  const byLogin = await pool.query(
    'SELECT id FROM user_profiles WHERE login_id = $1 OR email = $1 ORDER BY updated_at DESC LIMIT 1',
    [cleanId]
  );
  if (byLogin.rows.length > 0) return byLogin.rows[0].id;

  // 3. 외래 키 제약 조건 충족을 위해 기본 레코드 생성
  const newUuid = toUuid(cleanId);
  try {
    await pool.query(`
      INSERT INTO user_profiles (id, user_name, login_id, email)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO NOTHING;
    `, [newUuid, '소요 여행자', cleanId, cleanId.includes('@') ? cleanId : null]);
    return newUuid;
  } catch (err) {
    console.warn('⚠️ [resolveUserUuid] 프로필 자동 생성 예외:', err.message);
    return newUuid;
  }
}

// ─── 1. 폴더 및 핀 목록 조회 API ───
// GET /api/pins/folders?userId=...
router.get('/folders', async (req, res) => {
  try {
    const rawUserId = req.query.userId || req.headers['x-user-id'];
    if (!rawUserId) {
      return res.status(400).json({ success: false, error: 'userId 가 필요합니다.' });
    }

    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ success: false, error: '데이터베이스 연결이 설정되지 않았습니다.' });
    }

    const userUuid = await resolveUserUuid(rawUserId);

    // 폴더 목록 조회 (sort_order 및 created_at 순)
    let folderResult = await pool.query(`
      SELECT * FROM pin_folders 
      WHERE user_id = $1 
      ORDER BY sort_order ASC, created_at ASC;
    `, [userUuid]);

    // 폴더가 하나도 없으면 기본 '내 핀' 폴더 생성
    if (folderResult.rows.length === 0) {
      const defaultFolderId = crypto.randomUUID();
      await pool.query(`
        INSERT INTO pin_folders (id, user_id, folder_name, sort_order)
        VALUES ($1, $2, '내 핀', 0);
      `, [defaultFolderId, userUuid]);

      folderResult = await pool.query(`
        SELECT * FROM pin_folders 
        WHERE user_id = $1 
        ORDER BY sort_order ASC, created_at ASC;
      `, [userUuid]);
    }

    // 각 폴더에 매핑된 saved_routes 조회
    const routesResult = await pool.query(`
      SELECT * FROM saved_routes 
      WHERE user_id = $1 
      ORDER BY sort_order ASC, created_at DESC;
    `, [userUuid]);

    const folders = folderResult.rows.map((folderRow) => {
      const folderRoutes = routesResult.rows.filter(
        (r) => r.folder_id === folderRow.id || (!r.folder_id && folderRow.sort_order === 0)
      );

      const pins = folderRoutes.map((r) => {
        let geojson = null;
        try {
          geojson = typeof r.route_geojson === 'string' ? JSON.parse(r.route_geojson) : r.route_geojson;
        } catch {
          // ignore
        }

        const durationMin = Number(r.duration_minutes) || 25;
        const rawTitle = String(r.title || '산책 코스');
        const cleanTitle = rawTitle.replace(/\s*[\(\（]\s*\d+\s*분\s*[\)\）]/g, '').trim();
        const synchronizedTitle = `${cleanTitle} (${durationMin}분)`;

        return {
          id: r.id,
          title: synchronizedTitle,
          folderId: folderRow.id,
          startPoint: { name: r.start_place_name, lat: r.start_lat, lng: r.start_lng },
          destPoint: { name: r.dest_place_name, lat: r.dest_lat, lng: r.dest_lng },
          hasRestaurant: r.has_restaurant,
          durationMin,
          distanceKm: Number((r.distance_meters / 1000).toFixed(2)),
          roadType: r.has_restaurant ? '식당 포함 산책 코스' : '쾌적한 보행로',
          waypoints: `${r.start_place_name || '출발지'} → ${r.dest_place_name || '도착지'}`,
          path: geojson?.coordinates?.map(([lng, lat]) => ({ lat, lng })) || [],
          savedAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
        };
      });

      return {
        id: folderRow.id,
        name: folderRow.folder_name,
        sortOrder: folderRow.sort_order,
        createdAt: folderRow.created_at ? new Date(folderRow.created_at).toISOString() : new Date().toISOString(),
        pins,
        courses: pins // PinFlow 호환
      };
    });

    return res.json({ success: true, folders });
  } catch (err) {
    console.error('❌ [GET /api/pins/folders 에러]:', err);
    return res.status(500).json({ success: false, error: '핀 폴더 목록 조회 중 오류가 발생했습니다.' });
  }
});

// ─── 2. 새 폴더 만들기 API ───
// POST /api/pins/folders
router.post('/folders', async (req, res) => {
  try {
    const { userId: rawUserId, name } = req.body;
    if (!rawUserId || !name) {
      return res.status(400).json({ success: false, error: 'userId와 폴더 이름을 입력해주세요.' });
    }

    const trimmed = String(name).trim();
    if (!trimmed) {
      return res.status(400).json({ success: false, error: '올바른 폴더 이름을 입력해주세요.' });
    }

    const userUuid = await resolveUserUuid(rawUserId);

    // 중복 폴더명 체크
    const dupCheck = await pool.query(
      'SELECT id FROM pin_folders WHERE user_id = $1 AND folder_name = $2',
      [userUuid, trimmed]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ success: false, error: '같은 이름의 폴더가 이미 있습니다.' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const clientFolderId = req.body.id && uuidRegex.test(req.body.id) ? req.body.id : null;
    const newFolderId = clientFolderId || crypto.randomUUID();
    const countRes = await pool.query('SELECT COUNT(*) FROM pin_folders WHERE user_id = $1', [userUuid]);
    const nextOrder = parseInt(countRes.rows[0].count, 10) || 0;

    await pool.query(`
      INSERT INTO pin_folders (id, user_id, folder_name, sort_order)
      VALUES ($1, $2, $3, $4);
    `, [newFolderId, userUuid, trimmed, nextOrder]);

    const folder = {
      id: newFolderId,
      name: trimmed,
      sortOrder: nextOrder,
      createdAt: new Date().toISOString(),
      pins: [],
      courses: []
    };

    console.log(`✅ [새 핀 폴더 생성]: ${trimmed} (${newFolderId})`);
    return res.json({ success: true, folder });
  } catch (err) {
    console.error('❌ [POST /api/pins/folders 에러]:', err);
    return res.status(500).json({ success: false, error: '폴더 생성 중 오류가 발생했습니다.' });
  }
});

// ─── 3. 폴더 삭제 API ───
// DELETE /api/pins/folders/:id?userId=...
router.delete('/folders/:id', async (req, res) => {
  try {
    const folderId = req.params.id;
    const rawUserId = req.query.userId || req.body.userId || req.headers['x-user-id'];
    if (!rawUserId || !folderId) {
      return res.status(400).json({ success: false, error: 'userId와 folderId 가 필요합니다.' });
    }

    const userUuid = await resolveUserUuid(rawUserId);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // UUID 일치 또는 폴더명 일치로 안전하게 조회 (타입 에러 방지)
    let checkFolder;
    if (uuidRegex.test(folderId)) {
      checkFolder = await pool.query(
        'SELECT id, folder_name, sort_order FROM pin_folders WHERE id = $1 AND user_id = $2',
        [folderId, userUuid]
      );
    } else {
      checkFolder = await pool.query(
        'SELECT id, folder_name, sort_order FROM pin_folders WHERE folder_name = $1 AND user_id = $2',
        [folderId, userUuid]
      );
    }

    if (checkFolder.rows.length === 0) {
      return res.status(404).json({ success: false, error: '존재하지 않는 폴더입니다.' });
    }

    const targetRow = checkFolder.rows[0];
    if (targetRow.sort_order === 0 || targetRow.folder_name === '내 핀') {
      return res.status(400).json({ success: false, error: '기본 폴더는 삭제할 수 없습니다.' });
    }

    // 연관된 saved_routes 삭제
    await pool.query('DELETE FROM saved_routes WHERE folder_id = $1 AND user_id = $2', [targetRow.id, userUuid]);
    // 폴더 삭제
    await pool.query('DELETE FROM pin_folders WHERE id = $1 AND user_id = $2', [targetRow.id, userUuid]);

    console.log(`✅ [핀 폴더 삭제 완료]: ${targetRow.folder_name} (${targetRow.id})`);
    return res.json({ success: true, message: '폴더가 삭제되었습니다.' });
  } catch (err) {
    console.error('❌ [DELETE /api/pins/folders 에러]:', err);
    return res.status(500).json({ success: false, error: '폴더 삭제 중 오류가 발생했습니다.' });
  }
});

// ─── 4. 핀(경로) 저장 API ───
// POST /api/pins/routes
router.post('/routes', async (req, res) => {
  try {
    const { userId: rawUserId, folderId, route } = req.body;
    if (!rawUserId || !route) {
      return res.status(400).json({ success: false, error: 'userId와 route 정보가 필요합니다.' });
    }

    const userUuid = await resolveUserUuid(rawUserId);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // 대상 폴더 확인 (지정되지 않거나 비-UUID 일 경우 이름 조회 또는 sort_order 0 기본 폴더)
    let targetFolderId = folderId;
    if (!targetFolderId || targetFolderId === 'default' || !uuidRegex.test(targetFolderId)) {
      let foundFolder = null;
      if (targetFolderId && targetFolderId !== 'default') {
        const byName = await pool.query(
          'SELECT id FROM pin_folders WHERE user_id = $1 AND folder_name = $2 LIMIT 1',
          [userUuid, String(targetFolderId)]
        );
        if (byName.rows.length > 0) {
          foundFolder = byName.rows[0].id;
        }
      }
      if (foundFolder) {
        targetFolderId = foundFolder;
      } else {
        const defRes = await pool.query(
          'SELECT id FROM pin_folders WHERE user_id = $1 ORDER BY sort_order ASC LIMIT 1',
          [userUuid]
        );
        if (defRes.rows.length > 0) {
          targetFolderId = defRes.rows[0].id;
        } else {
          targetFolderId = crypto.randomUUID();
          await pool.query(
            "INSERT INTO pin_folders (id, user_id, folder_name, sort_order) VALUES ($1, $2, '내 핀', 0)",
            [targetFolderId, userUuid]
          );
        }
      }
    }

    const routeUuid = toUuid(route.id || crypto.randomUUID());
    const durationMin = Number(route.durationMin) || 25;
    const rawTitle = String(route.title || '산책 코스');
    const cleanTitle = rawTitle.replace(/\s*[\(\（]\s*\d+\s*분\s*[\)\）]/g, '').trim();
    const title = `${cleanTitle} (${durationMin}분)`;
    const startName = route.startPoint?.name || cleanTitle || '출발지';
    const startLat = route.startPoint?.lat || 37.4851;
    const startLng = route.startPoint?.lng || 126.8117;
    const destName = route.destPoint?.name || cleanTitle || '도착지';
    const destLat = route.destPoint?.lat || 37.4851;
    const destLng = route.destPoint?.lng || 126.8117;
    const hasRestaurant = Boolean(route.hasRestaurant);
    let coordinates = [];
    if (Array.isArray(route.geoPath) && route.geoPath.length > 0) {
      coordinates = route.geoPath.map((p) => [Number(p.lng), Number(p.lat)]);
    } else if (Array.isArray(route.path) && route.path.length > 0) {
      const first = route.path[0];
      if (first && typeof first.lat === 'number') {
        coordinates = route.path.map((p) => [Number(p.lng), Number(p.lat)]);
      } else if (Array.isArray(first) && first.length === 2) {
        if (first[0] > 100) {
          coordinates = route.path;
        } else if (first[1] > 100) {
          coordinates = route.path.map(([lat, lng]) => [lng, lat]);
        }
      }
    }
    const geojson = coordinates.length > 0 ? JSON.stringify({ type: 'LineString', coordinates }) : null;

    // 이미 저장된 핀인지 확인
    const dupCheck = await pool.query(
      'SELECT id FROM saved_routes WHERE user_id = $1 AND (id = $2 OR title = $3)',
      [userUuid, routeUuid, title]
    );

    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ success: false, error: '이미 저장된 경로입니다.' });
    }

    await pool.query(`
      INSERT INTO saved_routes (
        id, user_id, folder_id, title,
        start_place_name, start_lat, start_lng,
        dest_place_name, dest_lat, dest_lng,
        has_restaurant, duration_minutes, distance_meters, route_geojson, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 0);
    `, [
      routeUuid, userUuid, targetFolderId, title,
      startName, startLat, startLng,
      destName, destLat, destLng,
      hasRestaurant, durationMin, distanceMeters, geojson
    ]);

    console.log(`✅ [핀(경로) 저장 완료]: ${title} -> 폴더(${targetFolderId})`);
    return res.json({
      success: true,
      pin: {
        id: routeUuid,
        folderId: targetFolderId,
        title,
        durationMin,
        distanceKm: Number((distanceMeters / 1000).toFixed(2)),
        hasRestaurant,
        savedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('❌ [POST /api/pins/routes 에러]:', err);
    return res.status(500).json({ success: false, error: '경로 핀 저장 중 오류가 발생했습니다.' });
  }
});

// ─── 5. 핀 삭제 API ───
// DELETE /api/pins/folders/:folderId/routes/:routeId?userId=...&title=...
router.delete('/folders/:folderId/routes/:routeId', async (req, res) => {
  try {
    const { folderId, routeId } = req.params;
    const rawUserId = req.query.userId || req.body.userId || req.headers['x-user-id'];
    const title = req.query.title || req.body.title || null;
    if (!rawUserId) {
      return res.status(400).json({ success: false, error: 'userId 가 필요합니다.' });
    }

    const userUuid = await resolveUserUuid(rawUserId);
    const cleanTitle = title ? String(title).replace(/\s*[\(\（]\s*\d+\s*분\s*[\)\）]/g, '').trim() : '';

    let delRes;
    if (routeUuid && cleanTitle) {
      delRes = await pool.query(`
        DELETE FROM saved_routes 
        WHERE user_id = $1 AND (
          id = $2::uuid OR 
          title = $3 OR 
          title LIKE $4 || '%' OR 
          title ILIKE '%' || $4 || '%'
        );
      `, [userUuid, routeUuid, title, cleanTitle]);
    } else if (routeUuid) {
      delRes = await pool.query(`
        DELETE FROM saved_routes 
        WHERE user_id = $1 AND id = $2::uuid;
      `, [userUuid, routeUuid]);
    } else if (cleanTitle) {
      delRes = await pool.query(`
        DELETE FROM saved_routes 
        WHERE user_id = $1 AND (
          title = $2 OR 
          title LIKE $3 || '%' OR 
          title ILIKE '%' || $3 || '%'
        );
      `, [userUuid, title, cleanTitle]);
    }

    console.log(`✅ [핀 삭제 완료]: routeId ${routeId}, title: ${title}, deletedRows: ${delRes?.rowCount || 0}`);
    return res.json({ success: true, message: '핀이 삭제되었습니다.', deletedCount: delRes?.rowCount || 0 });
  } catch (err) {
    console.error('❌ [DELETE /api/pins/.../routes 에러]:', err);
    return res.status(500).json({ success: false, error: '핀 삭제 중 오류가 발생했습니다.' });
  }
});

// ─── 6. 핀 커스텀 순서 정렬 저장 API ───
// PUT /api/pins/folders/:folderId/routes/reorder
router.put('/folders/:folderId/routes/reorder', async (req, res) => {
  try {
    const { folderId } = req.params;
    const { userId: rawUserId, routeIds } = req.body;
    if (!rawUserId || !Array.isArray(routeIds)) {
      return res.status(400).json({ success: false, error: 'userId와 routeIds 배열이 필요합니다.' });
    }

    const userUuid = await resolveUserUuid(rawUserId);

    for (let index = 0; index < routeIds.length; index++) {
      const rId = toUuid(routeIds[index]);
      await pool.query(
        'UPDATE saved_routes SET sort_order = $1 WHERE user_id = $2 AND id = $3',
        [index, userUuid, rId]
      );
    }

    console.log(`✅ [핀 순서 재정렬 완료]: 폴더 ${folderId}, 개수: ${routeIds.length}`);
    return res.json({ success: true, message: '순서가 저장되었습니다.' });
  } catch (err) {
    console.error('❌ [PUT /api/pins/reorder 에러]:', err);
    return res.status(500).json({ success: false, error: '핀 순서 변경 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
