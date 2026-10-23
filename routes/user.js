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

// GET /api/user/profile — 사용자 프로필 조회
router.get('/profile', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId 파라미터가 필요합니다.' });
    }

    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ success: false, error: 'DB가 설정되지 않았습니다.' });
    }

    const validUserId = toUuid(userId);
    const result = await pool.query('SELECT * FROM user_profiles WHERE id = $1', [validUserId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '프로필을 찾을 수 없습니다.' });
    }

    const profileRow = result.rows[0];
    const medResult = await pool.query(
      'SELECT id, name, ingredient_name, timing, caution_note, dur_warning_tags FROM user_medications WHERE user_id = $1 ORDER BY created_at ASC',
      [validUserId]
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
      userId: profileRow.id,
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

// PUT /api/user/profile — 사용자 프로필 수정
router.put('/profile', async (req, res) => {
  try {
    const {
      userId,
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
    if (!targetUserId) {
      return res.status(400).json({ success: false, error: 'userId가 필요합니다.' });
    }

    const validUserId = toUuid(targetUserId);
    const finalUserName = name || userName || '소요 여행자';
    const finalBirthDateRaw = birth || birthDate || '1970-01-01';
    const formattedBirthDate = String(finalBirthDateRaw).split('T')[0];

    const finalAllergies = noAllergy ? [] : (Array.isArray(allergies) ? allergies : [allergies].filter(Boolean));
    const rawDiseases = diseases.length > 0 ? diseases : diseaseIds;
    const finalDiseases = noDisease ? [] : (Array.isArray(rawDiseases) ? rawDiseases : [rawDiseases].filter(Boolean));
    const finalMedications = noMedication ? [] : (Array.isArray(medications) ? medications : [medications].filter(Boolean));
    const hasMedication = finalMedications.length > 0;

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
          id, user_name, birth_date, age, chronic_conditions, allergies, has_medication, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          user_name = COALESCE(EXCLUDED.user_name, user_profiles.user_name),
          birth_date = COALESCE(EXCLUDED.birth_date, user_profiles.birth_date),
          age = COALESCE(EXCLUDED.age, user_profiles.age),
          chronic_conditions = EXCLUDED.chronic_conditions,
          allergies = EXCLUDED.allergies,
          has_medication = EXCLUDED.has_medication,
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
        hasMedication
      ]);

      // 복용 약물 목록 갱신 (전체 삭제 후 재등록 — 약물이 없으면 비움)
      await pool.query('DELETE FROM user_medications WHERE user_id = $1', [validUserId]);
      enrichedMedList = [];
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

      console.log(`✅ [Supabase DB] /api/user/profile 수정 완료: (${validUserId}) - 약물 ${enrichedMedList.length}건 동기화`);
    }

    const finalReturnMeds = enrichedMedList.length > 0
      ? enrichedMedList
      : finalMedications.map((m) => enrichMedication(m)).filter(Boolean);

    const profileData = {
      userId: validUserId,
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
