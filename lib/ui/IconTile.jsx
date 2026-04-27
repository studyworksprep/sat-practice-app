// IconTile — soft rounded-square wrapper around a section icon,
// matching the design-kit treatment in
// project/ui_kits/sat-practice-app/icons.html. The tile carries
// the color pair (background + foreground stroke), the icon sits
// inside at a size proportional to the tile.
//
// Usage:
//   <IconTile icon={RosterIcon} palette="navy" size="sm" />
//
// Props:
//   icon     — an icon component from lib/ui/icons (any of the
//              SvgRoot-based exports). Receives `size` from the
//              tile so its glyph fits the tile naturally.
//   palette  — one of: math | rw | navy | gold | cyan | success
//              | danger | amber | violet | pink | slate
//              (defaults to gold). Tokens defined in
//              app/styles/next-tokens.css under [data-tree="next"].
//   size     — sm (24×24 tile, 14px glyph) for inline labels;
//              md (32×32 tile, 18px glyph) — the default — for
//              card titles; lg (48×48 tile, 24px glyph) for empty-
//              state heroes.
//   className — passes through to the tile <span> for any
//               page-specific positioning overrides.

import s from './IconTile.module.css';

const ICON_SIZE_BY_TILE = { sm: 14, md: 18, lg: 24 };
const PALETTES = new Set([
  'math', 'rw', 'navy', 'gold', 'cyan',
  'success', 'danger', 'amber', 'violet', 'pink', 'slate',
]);

/**
 * @param {{
 *   icon: React.ComponentType<{ size?: number, className?: string }>,
 *   palette?: 'math'|'rw'|'navy'|'gold'|'cyan'|'success'|'danger'|'amber'|'violet'|'pink'|'slate',
 *   size?: 'sm'|'md'|'lg',
 *   className?: string,
 * }} props
 */
export function IconTile({
  icon: Icon,
  palette = 'gold',
  size = 'md',
  className,
}) {
  const safePalette = PALETTES.has(palette) ? palette : 'gold';
  const safeSize = size in ICON_SIZE_BY_TILE ? size : 'md';
  const cls = [
    s.tile,
    s[`pal_${safePalette}`],
    s[`size_${safeSize}`],
    className,
  ].filter(Boolean).join(' ');
  return (
    <span className={cls} aria-hidden="true">
      <Icon size={ICON_SIZE_BY_TILE[safeSize]} />
    </span>
  );
}
