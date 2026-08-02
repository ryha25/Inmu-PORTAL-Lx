import { randomUUID } from 'crypto'
import { Router } from 'express'
import { requireAdmin } from '../middlewares/session'

const router = Router()

router.get('/admin/battle-test/access', requireAdmin, (req, res): void => {
  res.json({ ok: true, adminType: req.adminType ?? 'owner', mode: 'admin_test', rewardsEnabled: false, persistenceEnabled: false })
})

router.post('/admin/battle-test/session', requireAdmin, (_req, res): void => {
  res.json({ ok: true, battleId: randomUUID(), mode: 'admin_test', rewardsEnabled: false, persistenceEnabled: false, issuedAt: new Date().toISOString() })
})

router.get('/admin/quests/access', requireAdmin, (req, res): void => {
  res.json({ ok: true, adminType: req.adminType ?? 'owner', mode: 'admin_test', rewardsEnabled: false, persistenceEnabled: false })
})

router.post('/admin/quests/session', requireAdmin, (_req, res): void => {
  res.json({
    ok: true,
    battleId: randomUUID(),
    questType: 'daily',
    mode: 'admin_test',
    rewardsEnabled: false,
    persistenceEnabled: false,
    consumesDailyAttempt: false,
    issuedAt: new Date().toISOString(),
  })
})

export default router
