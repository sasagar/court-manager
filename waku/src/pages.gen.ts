// deno-fmt-ignore-file
// biome-ignore format: generated types do not need formatting
// prettier-ignore
import type { PathsForPages, GetConfigResponse } from 'waku/router';

// prettier-ignore
import type { getConfig as File_Dashboard_getConfig } from './pages/dashboard';
// prettier-ignore
import type { getConfig as File_Index_getConfig } from './pages/index';
// prettier-ignore
import type { getConfig as File_Login_getConfig } from './pages/login';
// prettier-ignore
import type { getConfig as File_Profile_getConfig } from './pages/profile';
// prettier-ignore
import type { getConfig as File_Settings_getConfig } from './pages/settings';
// prettier-ignore
import type { getConfig as File_Setup_getConfig } from './pages/setup';
// prettier-ignore
import type { getConfig as File_Shifts_getConfig } from './pages/shifts';
// prettier-ignore
import type { getConfig as File_ViewToken_getConfig } from './pages/view/[token]';

// prettier-ignore
type Page =
| ({ path: '/dashboard' } & GetConfigResponse<typeof File_Dashboard_getConfig>)
| ({ path: '/' } & GetConfigResponse<typeof File_Index_getConfig>)
| ({ path: '/login' } & GetConfigResponse<typeof File_Login_getConfig>)
| ({ path: '/profile' } & GetConfigResponse<typeof File_Profile_getConfig>)
| ({ path: '/settings' } & GetConfigResponse<typeof File_Settings_getConfig>)
| ({ path: '/setup' } & GetConfigResponse<typeof File_Setup_getConfig>)
| ({ path: '/shifts' } & GetConfigResponse<typeof File_Shifts_getConfig>)
| ({ path: '/view/[token]' } & GetConfigResponse<typeof File_ViewToken_getConfig>);

// prettier-ignore
declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<Page>;
  }
  interface CreatePagesConfig {
    pages: Page;
  }
}
