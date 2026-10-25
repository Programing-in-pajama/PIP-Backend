const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool } = require('../lib/db');
const { enrichMedication } = require('./medications');

// UUID 형식 보장 헬퍼
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

// GET /api/user/profile — 사용자 프로필 조회 (UUID, loginId, email 지원)
router.get('/profile', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    const queryEmail = req.query.email ? String(req.query.email).trim().toLowerCase() : null;

    if (!userId && !queryEmail) {
      return res.status(400).json({ success: false, error: 'userId 또는 email 파라미터가 필요합니다.' });
    }

    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ success: false, error: 'DB가 설정되지 않았습니다.' });
    }

    const cleanId = String(userId || '').trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let result;
    if (uuidRegex.test(cleanId)) {
      result = await pool.query('SELECT * FROM user_profiles WHERE id = $1', [cleanId]);
    } else if (cleanId) {
      result = await pool.query('SELECT * FROM user_profiles WHERE login_id = $1 OR email = $1', [cleanId]);
    } else {
      result = { rows: [] };
    }

    if (result.rows.length === 0 && queryEmail) {
      result = await pool.query('SELECT * FROM user_profiles WHERE email = $1', [queryEmail]);
    }

    if (result.rows.length === 0 && cleanId) {
      const hashedUuid = toUuid(cleanId);
      result = await pool.query('SELECT * FROM user_profiles WHERE id = $1', [hashedUuid]);
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: '프로필을 찾을 수 없습니다.' });
      }
    } else if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '프로필을 찾을 수 없습니다.' });
    }

    const profileRow = result.rows[0];
    const realUserId = profileRow.id;
    const medResult = await pool.query(
      'SELECT id, name, ingredient_name, timing, caution_note, dur_warning_tags FROM user_medications WHERE user_id = $1 ORDER BY created_at ASC',
      [realUserId]
    );
    const medicationObjects = medResult.rows.map((r) => ({
      id: r.id,
      name: r.name,
      ingredientName: r.ingredient_name || '',
      timing: r.timing || '식후',
      cautionNote: r.caution_note || '',
      durWarningTags: r.dur_warning_tags ? r.dur_warning_tags.split(',').filter(Boolean) : []
    }));
    const medicationNames = medResult.rows.map((r) => r.name);

    const allergies = Array.isArray(profileRow.allergies)
      ? profileRow.allergies
      : (profileRow.allergies ? String(profileRow.allergies).split(', ') : []);

    const chronicConditions = Array.isArray(profileRow.chronic_conditions)
      ? profileRow.chronic_conditions
      : (profileRow.chronic_conditions ? String(profileRow.chronic_conditions).split(', ') : []);

    const formattedBirthDate = profileRow.birth_date
      ? (profileRow.birth_date instanceof Date
          ? profileRow.birth_date.toISOString().split('T')[0]
          : String(profileRow.birth_date).split('T')[0])
      : '1970-01-01';

    const profileData = {
      id: profileRow.id,
      userId: profileRow.id,
      supabaseUserId: profileRow.id,
      loginId: profileRow.login_id || cleanId,
      email: profileRow.email,
      userName: profileRow.user_name,
      birthDate: formattedBirthDate,
      age: profileRow.age,
      chronicConditions,
      diseaseIds: chronicConditions,
      allergies,
      hasMedication: profileRow.has_medication,
      medications: medicationObjects,
      medicationNames
    };

    return res.json({
      success: true,
      profile: profileData,
      data: profileData
    });
  } catch (err) {
    console.error('user 프로필 조회 오류:', err);
    return res.status(500).json({ success: false, error: '서버 내부 오류가 발생했습니다.' });
  }
});

// PUT /api/user/profile — 사용자 프로필 수정 (부분 수정 지원 및 기존 필드 보존)
router.put('/profile', async (req, res) => {
  try {
    const {
      userId,
      email,
      name,
      userName,
      birth,
      birthDate,
      allergies = [],
      diseases = [],
      diseaseIds = [],
      medications = [],
      noAllergy = false,
      noDisease = false,
      noMedication = false
    } = req.body;

    const targetUserId = userId || req.headers['x-user-id'];
    const cleanEmail = email ? String(email).trim().toLowerCase() : null;
    const cleanId = String(targetUserId || '').trim();

    if (!cleanId && !cleanEmail) {
      return res.status(400).json({ success: false, error: 'userId 또는 email이 필요합니다.' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let existingUser = null;

    if (process.env.DATABASE_URL) {
      try {
        const checkRes = await pool.query(
          `SELECT * FROM user_profiles 
           WHERE id = $1 
              OR ($2 <> '' AND login_id = $2) 
              OR ($3 <> '' AND email = $3)
           ORDER BY updated_at DESC LIMIT 1`,
          [cleanId || '', cleanId || '', cleanEmail || '']
        );
        if (checkRes.rows.length > 0) {
          existingUser = checkRes.rows[0];
        }
      } catch (checkErr) {
        console.warn('⚠️ [user.js 기존 사용자 조회 경고]:', checkErr.message);
      }
    }

    let validUserId = existingUser ? existingUser.id : null;
    if (!validUserId) {
      if (cleanId && uuidRegex.test(cleanId)) {
        validUserId = cleanId;
      } else {
        validUserId = toUuid(cleanId || cleanEmail);
      }
    }

    const finalUserName = (name || userName || existingUser?.user_name || '소요 여행자').trim();
    const finalBirthDateRaw = birth || birthDate || existingUser?.birth_date || '1970-01-01';
    const formattedBirthDate = finalBirthDateRaw instanceof Date
      ? finalBirthDateRaw.toISOString().split('T')[0]
      : String(finalBirthDateRaw).split('T')[0];

    const hasAllergiesField = req.body.allergies !== undefined || req.body.noAllergy !== undefined;
    const hasDiseasesField = req.body.diseases !== undefined || req.body.diseaseIds !== undefined || req.body.noDisease !== undefined;
    const hasMedicationsField = req.body.medications !== undefined || req.body.noMedication !== undefined;

    let finalAllergies;
    if (hasAllergiesField) {
      finalAllergies = noAllergy ? [] : (Array.isArray(allergies) ? allergies : [allergies].filter(Boolean));
    } else if (existingUser) {
      finalAllergies = Array.isArray(existingUser.allergies)
        ? existingUser.allergies
        : (existingUser.allergies ? String(existingUser.allergies).split(', ') : []);
    } else {
      finalAllergies = [];
    }

    let finalDiseases;
    if (hasDiseasesField) {
      const rawDiseases = diseases.length > 0 ? diseases : diseaseIds;
      finalDiseases = noDisease ? [] : (Array.isArray(rawDiseases) ? rawDiseases : [rawDiseases].filter(Boolean));
    } else if (existingUser) {
      finalDiseases = Array.isArray(existingUser.chronic_conditions)
        ? existingUser.chronic_conditions
        : (existingUser.chronic_conditions ? String(existingUser.chronic_conditions).split(', ') : []);
    } else {
      finalDiseases = [];
    }

    let finalMedications;
    let hasMedication;
    if (hasMedicationsField) {
      finalMedications = noMedication ? [] : (Array.isArray(medications) ? medications : [medications].filter(Boolean));
      hasMedication = finalMedications.length > 0;
    } else if (existingUser) {
      hasMedication = existingUser.has_medication;
      finalMedications = [];
    } else {
      finalMedications = [];
      hasMedication = false;
    }

    let calculatedAge = 50;
    if (formattedBirthDate) {
      const birthYear = new Date(formattedBirthDate).getFullYear();
      if (!isNaN(birthYear)) {
        calculatedAge = Math.max(0, new Date().getFullYear() - birthYear);
      }
    }

    let enrichedMedList = [];

    if (process.env.DATABASE_URL) {
      const profileQuery = `
        INSERT INTO user_profiles (
          id, user_name, birth_date, age, chronic_conditions, allergies, has_medication, email, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          user_name = COALESCE(EXCLUDED.user_name, user_profiles.user_name),
          birth_date = COALESCE(EXCLUDED.birth_date, user_profiles.birth_date),
          age = COALESCE(EXCLUDED.age, user_profiles.age),
          chronic_conditions = EXCLUDED.chronic_conditions,
          allergies = EXCLUDED.allergies,
          has_medication = EXCLUDED.has_medication,
          email = COALESCE(EXCLUDED.email, user_profiles.email),
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;
      await pool.query(profileQuery, [
        validUserId,
        finalUserName,
        formattedBirthDate,
        calculatedAge,
        finalDiseases,
        finalAllergies,
        hasMedication,
        cleanEmail || existingUser?.email || null
      ]);

      if (hasMedicationsField) {
        await pool.query('DELETE FROM user_medications WHERE user_id = $1', [validUserId]);
        for (const med of finalMedications) {
          const enriched = enrichMedication(med);
          if (!enriched) continue;
          const tagsStr = Array.isArray(enriched.durWarningTags)
            ? enriched.durWarningTags.join(',')
            : (enriched.durWarningTags || '');
          await pool.query(
            `
            INSERT INTO user_medications (id, user_id, name, ingredient_name, timing, caution_note, dur_warning_tags)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
          `,
            [validUserId, enriched.name, enriched.ingredientName, enriched.timing, enriched.cautionNote, tagsStr]
          );
          enrichedMedList.push(enriched);
        }
      } else {
        const medResult = await pool.query(
          'SELECT id, name, ingredient_name, timing, caution_note, dur_warning_tags FROM user_medications WHERE user_id = $1 ORDER BY created_at ASC',
          [validUserId]
        );
        enrichedMedList = medResult.rows.map((r) => ({
          id: r.id,
          name: r.name,
          ingredientName: r.ingredient_name || '',
          timing: r.timing || '식후',
          cautionNote: r.caution_note || '',
          durWarningTags: r.dur_warning_tags ? r.dur_warning_tags.split(',').filter(Boolean) : []
        }));
      }

      console.log(`✅ [Supabase DB] /api/user/profile 수정 완료: (${validUserId}) - 약물 ${enrichedMedList.length}건 동기화`);
    }

    const finalReturnMeds = enrichedMedList.length > 0
      ? enrichedMedList
      : finalMedications.map((m) => enrichMedication(m)).filter(Boolean);

    const profileData = {
      id: validUserId,
      userId: validUserId,
      supabaseUserId: validUserId,
      email: cleanEmail || existingUser?.email || null,
      userName: finalUserName,
      birthDate: formattedBirthDate,
      age: calculatedAge,
      allergies: finalAllergies,
      diseaseIds: finalDiseases,
      chronicConditions: finalDiseases,
      medications: finalReturnMeds,
      medicationNames: finalReturnMeds.map((m) => m.name),
      hasMedication
    };

    return res.json({
      success: true,
      profile: profileData,
      data: profileData
    });
  } catch (err) {
    console.error('user 프로필 수정 오류:', err);
    return res.status(500).json({ success: false, error: '서버 내부 오류가 발생했습니다.' });
  }
});

module.exports = router;
