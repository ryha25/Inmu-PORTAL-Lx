# PET Directional Battle Assets

Quest PETs use directional full-body images instead of Three.js sprites. This keeps the character facing its movement direction in the third-person camera.

1. Generate one 2x2 sheet on a flat chroma-key background.
2. Keep the same costume, proportions, weapon, lighting, and scale in all cells.
3. Place front and back views on the first row.
4. Place two opposite running strides on the second row.
5. Remove the chroma key and export front, back, left A/B, and right A/B as equal-size transparent PNGs.
6. Generate a second 2x2 action sheet containing attack windup, attack impact, dodge, and ultimate poses.
7. Add the direction and action images to `battleSprites` in `pet-definitions.ts`.
8. Use back while moving forward, front while moving backward, alternate the side A/B frames while strafing, and switch to the action poses only for their action window.

Do not use a Three.js `Sprite` for controllable PETs because it always faces the camera.
