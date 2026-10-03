// Runs in the browser. Collects what the device will tell us, for the
// activity record that goes with joins, uploads and messages.

export interface ClientInfo {
  tz?: string;
  lang?: string;
  langs?: string[];
  screen?: { w: number; h: number; dpr: number };
  viewport?: { w: number; h: number };
  platform?: string;
  mobile?: boolean;
  model?: string;
  platformVersion?: string;
  browsers?: string[];
  cores?: number;
  memoryGb?: number;
  touchPoints?: number;
  connection?: { type?: string; effectiveType?: string; downlinkMbps?: number };
  standalone?: boolean;
}

interface UAData {
  platform?: string;
  mobile?: boolean;
  getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string; platformVersion?: string; fullVersionList?: { brand: string; version: string }[] }>;
}

let cached: Promise<ClientInfo> | undefined;

export function collectClientInfo(): Promise<ClientInfo> {
  return (cached ??= (async () => {
    const nav = navigator as Navigator & {
      userAgentData?: UAData;
      deviceMemory?: number;
      connection?: { type?: string; effectiveType?: string; downlink?: number };
    };
    const info: ClientInfo = {
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      lang: nav.language,
      langs: nav.languages?.slice(0, 5),
      screen: { w: screen.width, h: screen.height, dpr: window.devicePixelRatio },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      platform: nav.userAgentData?.platform ?? nav.platform,
      mobile: nav.userAgentData?.mobile,
      cores: nav.hardwareConcurrency,
      memoryGb: nav.deviceMemory,
      touchPoints: nav.maxTouchPoints,
      connection: nav.connection
        ? { type: nav.connection.type, effectiveType: nav.connection.effectiveType, downlinkMbps: nav.connection.downlink }
        : undefined,
      standalone: window.matchMedia?.('(display-mode: standalone)').matches,
    };
    try {
      const hi = await nav.userAgentData?.getHighEntropyValues?.(['model', 'platformVersion', 'fullVersionList']);
      if (hi) {
        info.model = hi.model || undefined;
        info.platformVersion = hi.platformVersion;
        info.browsers = hi.fullVersionList?.map((b) => `${b.brand} ${b.version}`).slice(0, 5);
      }
    } catch {
      /* not offered by this browser */
    }
    return info;
  })());
}
