import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const evaluate = (source, globals = {}) => {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, ...globals })
  return exports
}

test('profilo: solo nome validato e normalizzato, telefono ed email esclusi dalla scrittura', async () => {
  const stored = { full_name: 'Mario', phone: '3331234567', email: 'mario@example.test' }
  const writes = [], paths = []
  let fail = false
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'resident' } } }) },
    from: table => {
      assert.equal(table, 'profiles')
      return { update: payload => {
        writes.push(payload)
        return { eq: (column, id) => {
          assert.equal(column, 'id'); assert.equal(id, 'resident')
          return { select: () => ({ single: async () => {
            if (fail) return { data: null, error: { code: '42501' } }
            Object.assign(stored, payload)
            return { data: { full_name: stored.full_name }, error: null }
          } }) }
        } }
      } }
    },
  }
  const { updateResidentProfile } = evaluate(read('../app/(app)/profilo/actions.ts'), {
    require: name => name === 'next/cache' ? { revalidatePath: path => paths.push(path) } : { createClient: async () => client },
    console: { error() {} },
  })
  for (const fullName of ['', ' ', 'A', 'A'.repeat(101), 'Ab\u0000']) {
    assert.ok((await updateResidentProfile({ fullName })).error)
  }
  assert.equal(writes.length, 0)
  const result = await updateResidentProfile({ fullName: '  Mario   Rossi  ', phone: '3390000000', email: 'other@example.test' })
  assert.equal(result.fullName, 'Mario Rossi')
  assert.deepEqual(Object.keys(writes[0]).sort(), ['full_name', 'updated_at'])
  assert.equal(stored.phone, '3331234567')
  assert.equal(stored.email, 'mario@example.test')
  assert.deepEqual(paths, ['/profilo', '/profilo/dati-personali'])
  fail = true
  const rejected = await updateResidentProfile({ fullName: 'Nuovo nome' })
  assert.equal(rejected.error, 'Impossibile salvare il nome. Riprova.')
  assert.equal(stored.full_name, 'Mario Rossi')
})

test('dati personali: solo nome editabile, annulla senza invii e bozza conservata dopo errore', async () => {
  const states = [], calls = []
  let cursor = 0, response = { error: 'Errore simulato' }, refreshes = 0
  const jsx = (type, props) => ({ type, props })
  const { DatiPersonaliClient } = evaluate(read('../app/(app)/profilo/dati-personali/DatiPersonaliClient.tsx'), {
    require: name => {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return { useState: initial => {
        const index = cursor++
        if (!(index in states)) states[index] = initial
        return [states[index], value => { states[index] = value }]
      } }
      if (name === 'next/navigation') return { useRouter: () => ({ refresh: () => refreshes++ }) }
      if (name.endsWith('/Button')) return { Button: 'button' }
      if (name.endsWith('/Input')) return { Input: 'input', Label: 'label' }
      return { updateResidentProfile: async input => { calls.push(input); return response } }
    },
  })
  const render = () => {
    cursor = 0
    return DatiPersonaliClient({ fullName: 'Mario', phone: '3331234567', email: 'mario@example.test' })
  }
  const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
  const find = (tree, type, text) => nodes(tree).find(node => node.type === type && (text === undefined || node.props.children === text))
  const assertReadOnlyContacts = tree => {
    assert.ok(find(tree, 'p', '3331234567'))
    assert.ok(find(tree, 'p', 'mario@example.test'))
    const inputs = nodes(tree).filter(node => node.type === 'input')
    assert.ok(inputs.every(node => node.props.id === 'resident-name'))
  }
  let tree = render()
  assertReadOnlyContacts(tree)
  assert.equal(nodes(tree).filter(node => node.type === 'input').length, 0)
  find(tree, 'button', 'Modifica dati personali').props.onClick()
  tree = render(); assertReadOnlyContacts(tree)
  find(tree, 'input').props.onChange({ target: { value: 'Bozza' } })
  tree = render(); find(tree, 'button', 'Annulla').props.onClick()
  tree = render(); assert.ok(find(tree, 'p', 'Mario')); assert.equal(calls.length, 0)
  find(tree, 'button', 'Modifica dati personali').props.onClick()
  tree = render(); find(tree, 'input').props.onChange({ target: { value: '  Mario   Rossi  ' } })
  tree = render(); await find(tree, 'form').props.onSubmit({ preventDefault() {} })
  tree = render(); assertReadOnlyContacts(tree)
  assert.equal(find(tree, 'input').props.value, '  Mario   Rossi  ')
  assert.ok(find(tree, 'p', 'Errore simulato'))
  assert.deepEqual(Object.keys(calls[0]), ['fullName'])
  response = { fullName: 'Mario Rossi' }
  await find(tree, 'form').props.onSubmit({ preventDefault() {} })
  tree = render(); assertReadOnlyContacts(tree)
  assert.ok(find(tree, 'p', 'Mario Rossi')); assert.equal(refreshes, 1)
  assert.equal(nodes(tree).filter(node => node.type === 'input').length, 0)
})

function fixture() {
  const logs = [], sent = [], recorded = []
  const members = ['before', 'error', 'missing', 'throw', 'disabled', 'after', 'after'].map(profile_id => ({ profile_id }))
  const client = {
    from(table) {
      return {
        select() { return this },
        eq(column, id) { if (table === 'profiles') this.id = id; return this },
        is: async () => ({ data: members }),
        async maybeSingle() {
          if (this.id === 'throw') throw new Error('Network failure')
          if (this.id === 'error') return { data: null, error: { message: 'Read failure' } }
          if (this.id === 'missing') return { data: null, error: null }
          return { data: { notification_prefs: this.id === 'disabled' ? { email_reminders: false, email_n3_status: false } : null }, error: null }
        },
        single: async () => ({ data: { name: 'Residenza' } }),
        insert: async notification => { recorded.push(notification.profile_id) },
      }
    },
    auth: { admin: { getUserById: async id => ({ data: { user: { email: id } } }) } },
  }
  const { allowsResidentEmail } = evaluate(read('./resident-email-preferences.ts'), {
    console: { error: (...args) => logs.push(args) },
  })
  return { client, logs, sent, recorded, allowsResidentEmail }
}

test('preferenze assenti: default attivo; false, profilo mancante ed errori: nessun invio opzionale', async () => {
  const f = fixture()
  for (const category of ['email_reminders', 'email_n3_status']) {
    for (const [id, expected] of [['before', true], ['disabled', false], ['error', false], ['missing', false], ['throw', false], ['after', true]]) {
      assert.equal(await f.allowsResidentEmail(f.client, id, category), expected)
    }
  }
  assert.equal(f.logs.length, 6)
})

test('invii condominiali: errore isolato, destinatari successivi raggiunti e duplicati preservati', async () => {
  const f = fixture()
  const source = read('../app/(dashboard)/admin/manutenzioni/actions.ts')
  const { notifyResidents } = evaluate(`export ${source.slice(source.indexOf('async function notifyResidents('))}`, {
    createServiceClient: () => f.client,
    process: { env: {} }, APP_URL: 'https://example.test',
    allowsResidentEmail: f.allowsResidentEmail,
    sendEmail: async ({ to }) => f.sent.push(to), emailN3StatusChanged: () => '',
  })
  await notifyResidents('residence', 'item', 'Manutenzione')
  assert.deepEqual(f.sent, ['before', 'after', 'after'])
  assert.deepEqual(f.recorded, f.sent)
  assert.equal(f.logs.length, 3)
})

test('cron: errori isolati sui promemoria opzionali; avvisi e solleciti obbligatori invariati', async () => {
  for (const type of ['n1_due', 'n2_due', 'n2_reminder']) {
    const f = fixture()
    const source = read('../app/api/cron/daily/route.ts')
    const start = source.indexOf('async function notifyUnitMembers(')
    const end = source.indexOf('async function notifyResidenceAdmins(', start)
    const { notifyUnitMembers } = evaluate(`export ${source.slice(start, end)}`, {
      allowsResidentEmail: f.allowsResidentEmail,
      getItemLinkRoles: async () => new Map(), linkRoleFor: () => 'client',
      getEmailForProfile: async (_, id) => id,
      maintenanceItemUrl: () => '', APP_URL: 'https://example.test',
      sendEmail: async ({ to }) => f.sent.push(to),
    })
    await notifyUnitMembers(f.client, 'unit', 'residence', 'item', type, 'Manutenzione', '2026-11-12', () => ({ subject: '', html: '' }))
    const expected = type === 'n1_due' ? ['before', 'after', 'after'] : ['before', 'error', 'missing', 'throw', 'disabled', 'after', 'after']
    assert.deepEqual(f.sent, expected)
    assert.deepEqual(f.recorded, expected)
    assert.equal(f.logs.length, type === 'n1_due' ? 3 : 0)
  }
})
