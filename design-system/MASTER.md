# Media Extractor — main design rules

This is the visual source of truth for the extension, adapted from the user's supplied Apple-style rules. All future tools share this shell. YouTube is the only working tool in this release; do not invent disabled platform tiles or imply additional support.

## Foundation

- Light only. Flat surfaces. No gradients, drop shadows, decorative accent fills, or orange/neumorphic styling.
- Ink `#000000`, secondary ink `#1D1D1F`, muted `#6E6E73`.
- Main surface `#FAFAFC`, header / button text `#FFFFFF`, secondary plane `#F5F5F7`.
- Action blue `#0071E3`, pressed blue `#0066CC`, inline-link blue `#2997FF`.
- Functional borders `#D2D2D7`; use for inputs/tabs, not decorative section rules.
- Brand assets retain their original colors. YouTube's official red logo is the explicit exception to the monochrome application palette; it identifies a tool, never the extension itself.

## Typography

Bundled Inter substitutes for SF Pro. Use only weights 400, 600, 700. No 500/650 weights. Body/micro tracking is slightly negative; display sizes 21px+ use the supplied positive/normal tracking. Typical popup tokens: title 21px/400/1.2/+0.231px; body 17px/400/1.45/−0.374px; caption 14px/400 or 600/1.3/−0.224px; micro 12px/400 or 600/1.35/−0.12px. Use `font-optical-sizing:auto`.

## Geometry and spacing

Buttons and badges: 980px radius. Inputs: 8px. Cards: 11px. Containers: rectangular. No shadow token exists. Use 4–21px for component spacing. The source's 44–53px section gaps and 56px marketing headlines are not copied into a small popup; use them only on future full-page surfaces where they fit.

Header: 44px, no border, translucent white with `saturate(1.8) blur(20px)`. Footer: gray plane, no rule. Interactive targets should be at least 44px high; tabs may sit inside a 44px strip.

## Popup contract

420px explicit width/min-width on both html and body; never constrain width to `100vw`, which caused native popup shrinkage. Nominal height 512px; body adapts to available native viewport height. Scroll only the main content. Verify the actual Brave popup target, no horizontal overflow, and the primary button above the footer.

## Interaction

Keep Download, Activity, and Settings as real working views. Blue means interactive. Missing setup gets a direct recovery action and does not offer a working download CTA. Keep labels, keyboard focus, disabled states, and live status feedback. Honor reduced motion. Preserve URL drafts, quality, background download continuity, and folder settings.

## Brand and extension identity

The product shell is **Media Extractor**. Individual services use their own real brand asset. The YouTube asset is downloaded unchanged from the official brand package; see `extension/assets/README.md`. Do not redraw or recolor it. The extension toolbar icon is a neutral download symbol, not a modified YouTube mark.
