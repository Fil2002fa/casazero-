// Rilevazione piattaforma per l'installazione della PWA residente. Funzioni pure
// sullo user agent: chi le chiama le esegue solo lato client, dopo il mount.

export type InstallPlatform =
  | { kind: 'ios' }
  | { kind: 'android' }
  | { kind: 'in-app'; app: string; os: 'ios' | 'android' | 'other' }
  | { kind: 'unsupported' }

const IN_APP_BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/WhatsApp/i, 'WhatsApp'],
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB|FB4A|FBIOS/i, 'Facebook'],
  [/Messenger/i, 'Messenger'],
]

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

export function detectInstallPlatform(ua: string, nav: Navigator): InstallPlatform {
  // iPadOS si presenta come Mac: lo distingue il touch.
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  const isAndroid = /Android/.test(ua)
  const os = isIOS ? 'ios' : isAndroid ? 'android' : 'other'

  const named = IN_APP_BROWSERS.find(([re]) => re.test(ua))
  if (named) return { kind: 'in-app', app: named[1], os }

  // WebView Android dichiara "; wv)"; una WKWebView iOS non ha il token Safari/
  // che invece Safari, Chrome e Firefox per iOS portano sempre.
  if (isAndroid && /; wv\)/.test(ua)) return { kind: 'in-app', app: "un'altra app", os }
  if (isIOS && !/Safari\//.test(ua)) return { kind: 'in-app', app: "un'altra app", os }

  if (isIOS) return { kind: 'ios' }
  if (isAndroid) return { kind: 'android' }
  return { kind: 'unsupported' }
}
