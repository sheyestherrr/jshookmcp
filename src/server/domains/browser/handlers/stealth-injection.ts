import type { PageController } from '@server/domains/shared/modules/collector';
import { StealthScripts } from '@server/domains/shared/modules';
import { argString } from '@server/domains/shared/parse-args';
import { createStub } from '@server/domains/shared/capabilities';
import { CDPTimingProxy } from '@modules/stealth/CDPTimingProxy';
import type { CDPTimingOptions } from '@modules/stealth/CDPTimingProxy.types';
import { DEFAULT_TIMING_OPTIONS } from '@modules/stealth/CDPTimingProxy.types';
import { SessionProfileManager } from '@modules/stealth/SessionProfileManager';
import type { SessionProfile } from '@internal-types/SessionProfile';
import { logger } from '@utils/logger';
import { R } from '@server/domains/shared/ResponseBuilder';
import type { ToolResponse } from '@server/domains/shared/ResponseBuilder';

const STEALTH_PATCH_MANIFEST = [
  { api: 'navigator.webdriver', method: 'property override (configurable:false)' },
  { api: 'window.chrome', method: 'object injection (runtime, loadTimes, csi)' },
  { api: 'navigator.plugins', method: 'PluginArray override (spoofed length/names)' },
  { api: 'Permissions.query', method: 'result filter (returns granted/prompt)' },
  { api: 'HTMLCanvasElement.toDataURL/toBlob', method: 'pixel noise injection' },
  { api: 'WebGLRenderingContext.getParameter', method: 'vendor/renderer override' },
  { api: 'navigator.languages', method: 'array override (locale-specific)' },
  { api: 'navigator.getBattery', method: 'fake BatteryManager' },
  { api: 'MediaDevices.enumerateDevices', method: 'device list filter' },
  { api: 'Notification.permission', method: 'permission override' },
  { api: 'performance.now / Date.now', method: 'timing offset compensation' },
  { api: 'CDP request timing', method: 'jitter compensation proxy' },
];

interface StealthInjectionHandlersDeps {
  pageController: PageController;
  getActiveDriver: () => 'chrome' | 'camoufox';
}

/** Module-level jitter configuration shared across handler calls. */
const jitterOptions: CDPTimingOptions = { ...DEFAULT_TIMING_OPTIONS };
let fingerprintManagerInstance: FingerprintManagerLike | null = null;
const sessionProfileManager = SessionProfileManager.getInstance();

interface FingerprintManagerLike {
  isAvailable(): boolean;
  generateFingerprint(options?: Record<string, unknown>): Promise<unknown>;
  injectFingerprint(page: unknown, profile: unknown): Promise<void>;
  getActiveProfile(): unknown;
}

async function getFingerprintManager(): Promise<FingerprintManagerLike | null> {
  if (fingerprintManagerInstance) return fingerprintManagerInstance;
  try {
    const mod = await import('@modules/stealth/FingerprintManager');
    fingerprintManagerInstance = mod.FingerprintManager.getInstance();
    return fingerprintManagerInstance;
  } catch {
    return null;
  }
}

/** @internal Reset the cached FingerprintManager instance. Exported for testing only. */
export function resetFingerprintCacheForTesting(): void {
  fingerprintManagerInstance = null;
}

export class StealthInjectionHandlers {
  constructor(private deps: StealthInjectionHandlersDeps) {}

  private getDefaultUserAgent(os: 'windows' | 'mac' | 'linux'): string {
    const userAgents = {
      windows:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      linux:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    return userAgents[os] || userAgents.windows;
  }

  async handleStealthInject(_args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      if (this.deps.getActiveDriver() === 'camoufox') {
        return R.ok().build({
          driver: 'camoufox',
          message:
            'Camoufox uses C++ engine-level fingerprint spoofing — JS-layer stealth scripts are not needed and ' +
            'have been skipped.',
        });
      }

      const page = await this.deps.pageController.getPage();

      // Inject fingerprint BEFORE stealth scripts (if available)
      const fm = await getFingerprintManager();
      let fingerprintApplied = false;
      if (fm?.isAvailable()) {
        try {
          let profile = fm.getActiveProfile();
          if (!profile) {
            profile = await fm.generateFingerprint();
          }
          if (profile) {
            await fm.injectFingerprint(page, profile);
            fingerprintApplied = true;
          }
        } catch (err) {
          logger.warn('Fingerprint injection failed, falling back to StealthScripts:', err);
        }
      }

      await StealthScripts.injectAll(page);

      if (fingerprintApplied && fm) {
        const activeProfile = fm.getActiveProfile() as {
          headers?: Record<string, string>;
          os?: string;
        } | null;
        const cached = sessionProfileManager.getValidProfile();
        const mergedProfile: SessionProfile = {
          cookies: cached?.cookies ?? [],
          userAgent: activeProfile?.headers?.['User-Agent'] ?? cached?.userAgent,
          acceptLanguage: activeProfile?.headers?.['Accept-Language'] ?? cached?.acceptLanguage,
          referer: cached?.referer,
          clientHints: cached?.clientHints,
          platform: activeProfile?.os ?? cached?.platform,
          origin: cached?.origin,
          collectedAt: cached?.collectedAt ?? Date.now(),
          ttlSec: cached?.ttlSec ?? 1800,
        };
        sessionProfileManager.setProfile(mergedProfile);
      }

      return R.ok().build({
        message: 'Stealth scripts injected successfully',
        fingerprintApplied,
        patchManifest: STEALTH_PATCH_MANIFEST,
        _nextStepHint:
          'Stealth patches are now active. ' +
          'Next: navigate to your target URL with page_navigate. ' +
          'Do NOT call stealth_inject again — it only needs to run once per page.',
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleStealthSetUserAgent(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      const platform = argString(args, 'platform', 'windows') as 'windows' | 'mac' | 'linux';
      const page = await this.deps.pageController.getPage();

      await StealthScripts.setRealisticUserAgent(page, platform);

      return R.ok().build({
        platform,
        message: `User-Agent set for ${platform}`,
        _nextStepHint:
          'User-Agent is now configured. ' +
          'Next: call stealth_inject to apply all anti-detection patches, ' +
          'then page_navigate to your target URL.',
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleStealthConfigureJitter(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      if (args.enabled !== undefined) jitterOptions.enabled = Boolean(args.enabled);
      if (typeof args.minDelayMs === 'number') jitterOptions.minDelayMs = args.minDelayMs;
      if (typeof args.maxDelayMs === 'number') jitterOptions.maxDelayMs = args.maxDelayMs;
      if (args.burstMode !== undefined) jitterOptions.burstMode = Boolean(args.burstMode);

      return R.ok().build({
        jitterOptions,
        message:
          `CDP timing jitter ${jitterOptions.enabled ? 'enabled' : 'disabled'}: ${jitterOptions.minDelayMs}-` +
          `${jitterOptions.maxDelayMs}ms${jitterOptions.burstMode ? ' (burst mode)' : ''}`,
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleStealthGenerateFingerprint(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      // Route to camoufox-native fingerprint generation when driver=camoufox
      if (this.deps.getActiveDriver() === 'camoufox') {
        try {
          const fingerprints = await import('camoufox-js/fingerprints');
          const os = argString(args, 'os', 'windows');
          const fp = await fingerprints.generateFingerprint(os);
          return R.ok().build({
            fingerprint: fp,
            driver: 'camoufox',
            message:
              'Fingerprint generated using camoufox native engine. Apply via browser_launch(fingerprint=...) ' +
              'before launching.',
          });
        } catch (err) {
          return R.fail(
            `Camoufox fingerprint generation failed: ${err instanceof Error ? err.message : String(err)}`,
          ).build();
        }
      }

      const fm = await getFingerprintManager();

      if (!fm?.isAvailable()) {
        // Fallback: return basic profile without fingerprint-generator
        const locale = argString(args, 'locale', 'en-US');
        const os = argString(args, 'os', 'windows');
        const browser = argString(args, 'browser', 'chrome');

        const basicProfile = {
          userAgent: this.getDefaultUserAgent(os as 'windows' | 'mac' | 'linux'),
          acceptLanguage: locale,
          platform: os,
          browser,
          _note:
            'Basic profile without fingerprint-generator. Install fingerprint-generator for full profile.',
        };

        const stubData = createStub({
          tool: 'stealth_generate_fingerprint',
          stubType: 'partial',
          reason:
            'fingerprint-generator/fingerprint-injector packages not installed, using basic profile',
          fix: 'Install for full fingerprint: pnpm add fingerprint-generator fingerprint-injector',
          data: {
            available: false,
            capability: 'fingerprint_generator',
            status: 'partial',
            profile: basicProfile,
          },
        });
        return R.ok().merge(stubData).merge({ profile: basicProfile }).build();
      }

      const profile = await fm.generateFingerprint({
        os: args.os,
        browser: args.browser ?? 'chrome',
        locale: args.locale ?? 'en-US',
      });

      return R.ok().build({
        profile,
        message:
          'Fingerprint generated and cached. It will be auto-applied on next stealth_inject.',
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleStealthVerify(_args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      const page = await this.deps.pageController.getPage();
      const mod = await import('@modules/stealth/StealthVerifier');
      const verifier = new mod.StealthVerifier();
      const result = await verifier.verify(page);

      return R.ok()
        .merge(result as any)
        .build();
    } catch (err) {
      return R.fail(
        `Stealth verification failed: ${err instanceof Error ? err.message : String(err)}`,
      ).build();
    }
  }

  async handleCamoufoxGeolocation(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      const locale = argString(args, 'locale');
      if (!locale) {
        return R.fail('locale is required (e.g. "en-US", "zh-CN")').build();
      }

      let geo: { latitude: number; longitude: number; accuracy: number };
      try {
        const localeMod = await import('camoufox-js/locale');
        geo = await localeMod.getGeolocation(locale);
      } catch (err) {
        const stubData = createStub({
          tool: 'camoufox_geolocation',
          stubType: 'unavailable',
          reason: `Camoufox locale module unavailable: ${err instanceof Error ? err.message : String(err)}. Ensure camoufox-js is installed.`,
          fix: 'Install camoufox-js and fetch its browser assets: pnpm add camoufox-js && npx camoufox-js fetch',
          data: {
            available: false,
            capability: 'camoufox_locale',
            status: 'unavailable', // Keep for backward compatibility
          },
        });
        return R.fail(stubData.reason as string)
          .merge(stubData)
          .build();
      }

      let publicIp: string | null = null;
      const proxy = argString(args, 'proxy');
      if (proxy) {
        try {
          const ipMod = await import('camoufox-js/ip');
          publicIp = await ipMod.publicIP(proxy);
        } catch {
          // Optional — IP lookup failure is non-critical
        }
      }

      return R.ok().build({ locale, geolocation: geo, publicIp });
    } catch (e) {
      const stubData = createStub({
        tool: 'camoufox_geolocation',
        stubType: 'unavailable',
        reason: `Camoufox locale module unavailable: ${e instanceof Error ? e.message : String(e)}`,
        fix: 'Install camoufox-js and fetch its browser assets: pnpm add camoufox-js && npx camoufox-js fetch',
        data: {
          available: false,
          capability: 'camoufox_locale',
          status: 'unavailable', // Keep for backward compatibility
        },
      });
      return R.fail(stubData.reason as string)
        .merge(stubData)
        .build();
    }
  }
}

/** Get the current jitter options (for use by other modules). */
export function getJitterOptions(): CDPTimingOptions {
  return { ...jitterOptions };
}

/** Create a jitter-wrapped CDP session using current configuration. */
export function createJitteredSession(session: {
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  on: (event: string, handler: (params: unknown) => void) => void;
  off: (event: string, handler: (params: unknown) => void) => void;
}): CDPTimingProxy {
  return new CDPTimingProxy(session, jitterOptions);
}
