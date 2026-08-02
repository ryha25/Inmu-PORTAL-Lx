import { RotateCcw, ShieldCheck, Swords } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { DEFAULT_BATTLE_SETTINGS, PET_DEFINITIONS, settingsForPet } from './pet-definitions'
import { clampNumber } from './combat-math'
import type { BattlePetId, BattleSettings } from './types'

type NumberField = { key: keyof BattleSettings; label: string; min: number; max: number; step?: number }

const PET_FIELDS: NumberField[] = [
  { key: 'petLevel', label: 'PETレベル', min: 31, max: 60 },
  { key: 'petHp', label: 'PET HP', min: 1, max: 1_000_000 },
  { key: 'petAtk', label: 'PET ATK', min: 0, max: 10_000 },
  { key: 'petDef', label: 'PET DEF', min: 0, max: 10_000 },
  { key: 'petSp', label: 'PET SP', min: 0, max: 1_000 },
]

const ENEMY_FIELDS: NumberField[] = [
  { key: 'enemyHp', label: '敵 HP', min: 1, max: 5_000_000 },
  { key: 'enemyAtk', label: '敵 ATK', min: 0, max: 10_000 },
  { key: 'enemyDef', label: '敵 DEF', min: 0, max: 10_000 },
  { key: 'enemyMoveSpeed', label: '敵移動速度', min: 0.1, max: 10, step: 0.1 },
  { key: 'enemyAttackInterval', label: '敵攻撃間隔（秒）', min: 0.2, max: 10, step: 0.1 },
  { key: 'timeLimit', label: '制限時間（秒）', min: 10, max: 3600 },
]

const TOGGLES: Array<{ key: keyof BattleSettings; label: string }> = [
  { key: 'enemyAi', label: '敵AI' },
  { key: 'invincible', label: '無敵モード' },
  { key: 'freeUltimate', label: '必殺技SP消費なし' },
  { key: 'noAttackCooldown', label: '通常攻撃クールダウンなし' },
  { key: 'stopEnemyAttacks', label: '敵の攻撃停止' },
  { key: 'showDamage', label: 'ダメージ表示' },
  { key: 'showHitboxes', label: '当たり判定表示' },
]

export function BattleTestSettings({
  settings,
  onChange,
  onStart,
}: {
  settings: BattleSettings
  onChange: (settings: BattleSettings) => void
  onStart: () => void
}) {
  const pet = PET_DEFINITIONS[settings.petId]

  const updateNumber = (field: NumberField, raw: string) => {
    const fallback = Number(DEFAULT_BATTLE_SETTINGS[field.key])
    onChange({ ...settings, [field.key]: clampNumber(raw, field.min, field.max, fallback) })
  }

  return (
    <div className="space-y-5">
      <section className="border border-amber-400/30 bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Swords className="size-5 text-amber-400" />
          <h2 className="text-base font-bold">使用PET</h2>
        </div>
        <select
          value={settings.petId}
          onChange={(event) => onChange(settingsForPet(event.target.value as BattlePetId, settings))}
          className="h-11 w-full border border-border bg-background px-3 text-sm"
        >
          {Object.values(PET_DEFINITIONS).map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <div className="mt-3 border-l-2 pl-3 text-sm text-muted-foreground" style={{ borderColor: pet.color }}>
          <p>{pet.type}タイプ / 通常攻撃CD {pet.attackCooldown}秒</p>
          <p>{pet.ultimateDescription}</p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <NumberSection title="PETテスト値" fields={PET_FIELDS} settings={settings} update={updateNumber} />
        <NumberSection title="テストモンスター" fields={ENEMY_FIELDS} settings={settings} update={updateNumber} />
      </div>

      <section className="border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="size-5 text-cyan-400" />
          <h2 className="text-base font-bold">テスト補助</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {TOGGLES.map(({ key, label }) => (
            <label key={key} className="flex min-h-11 items-center justify-between border border-border bg-background px-3 text-sm">
              <span>{label}</span>
              <Switch checked={Boolean(settings[key])} onCheckedChange={(checked) => onChange({ ...settings, [key]: checked })} />
            </label>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onStart} className="min-h-12 flex-1 bg-amber-400 px-5 font-bold text-black hover:bg-amber-300">
          バトル開始
        </button>
        <button type="button" onClick={() => onChange({ ...DEFAULT_BATTLE_SETTINGS })} className="inline-flex min-h-12 items-center justify-center gap-2 border border-border px-5 font-medium hover:bg-secondary">
          <RotateCcw className="size-4" /> 初期設定へ戻す
        </button>
      </div>
    </div>
  )
}

function NumberSection({ title, fields, settings, update }: { title: string; fields: NumberField[]; settings: BattleSettings; update: (field: NumberField, raw: string) => void }) {
  return (
    <section className="border border-border bg-card p-4">
      <h2 className="mb-3 text-base font-bold">{title}</h2>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((field) => (
          <label key={field.key} className="text-xs text-muted-foreground">
            {field.label}
            <input
              type="number"
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              value={Number(settings[field.key])}
              onChange={(event) => update(field, event.target.value)}
              onBlur={(event) => update(field, event.target.value)}
              className="mt-1 h-10 w-full border border-border bg-background px-2 text-sm text-foreground"
            />
          </label>
        ))}
      </div>
    </section>
  )
}
