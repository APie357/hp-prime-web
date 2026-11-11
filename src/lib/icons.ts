/**
 * Material Symbols (Rounded, weight 400) used by the UI, bundled at build time from
 * `@material-symbols/svg-400` (Apache-2.0). Only the files named in the glob below are bundled,
 * so add a name here (and to the pattern) before using it.
 */
const raw = import.meta.glob(
  '/node_modules/@material-symbols/svg-400/rounded/{add,apps,article,back_hand,brightness_auto,circle-fill,close,code,dark_mode,data_object,database,delete,description,download,draft,edit,file_export,file_open,folder,folder_open,image,info,keyboard_arrow_down,keyboard_arrow_left,keyboard_arrow_right,keyboard_arrow_up,light_mode,play_arrow,refresh,schedule,science,settings,shield_lock,tune,upload,upload_file,usb,usb_off,widgets}.svg',
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>;

export type IconName =
  | 'add'
  | 'apps'
  | 'article'
  | 'back_hand'
  | 'brightness_auto'
  | 'circle-fill'
  | 'close'
  | 'code'
  | 'dark_mode'
  | 'data_object'
  | 'database'
  | 'delete'
  | 'description'
  | 'download'
  | 'draft'
  | 'edit'
  | 'file_export'
  | 'file_open'
  | 'folder'
  | 'folder_open'
  | 'image'
  | 'info'
  | 'keyboard_arrow_down'
  | 'keyboard_arrow_left'
  | 'keyboard_arrow_right'
  | 'keyboard_arrow_up'
  | 'light_mode'
  | 'play_arrow'
  | 'refresh'
  | 'schedule'
  | 'science'
  | 'settings'
  | 'shield_lock'
  | 'tune'
  | 'upload'
  | 'upload_file'
  | 'usb'
  | 'usb_off'
  | 'widgets';

/** Inner markup (the `<path>`s) of each icon; every file uses viewBox "0 -960 960 960". */
export const ICON_BODY: Record<string, string> = Object.fromEntries(
  Object.entries(raw).map(([path, svg]) => [
    path.replace(/^.*\/|\.svg$/g, ''),
    svg.replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, ''),
  ]),
);

/** Icon for a file in the file list and editor tabs (Python files use the Python logo instead). */
export function fileIcon(type: string): IconName {
  switch (type) {
    case 'program':
    case 'app-program':
      return 'code';
    case 'note':
      return 'description';
    case 'app-note':
      return 'info';
    case 'text':
      return 'article';
    case 'exam':
      return 'shield_lock';
    default:
      return 'draft';
  }
}
