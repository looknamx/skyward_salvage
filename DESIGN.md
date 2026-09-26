# Skyward Salvage — playable first version

An original side-view, turn-based artillery game for 2–4 friends in a private browser room. The visual direction follows the approved floating-island concept images in `../turn_artillery_concept/`.

## Rules

- One player creates a room and shares its code or link. The host starts when 2–4 players have joined. Each player chooses Loom, Manta, or Borer.
- Players act in join order. A turn lasts 30 seconds. A timed-out turn passes to the next living player.
- Move with the left and right arrow keys at 88 world units per second, following the ground and stopping before another Mobile. Walking faces the Mobile in that direction; R or the turn button flips it in place. The server owns position and facing and broadcasts both to every client.
- Adjust the 10–80 degree aim from the Mobile's front with the up and down arrow keys. Hold Fire or Space to charge power smoothly from 20% to 100% over 2.4 seconds, then release to shoot. The shot starts at the front of the Mobile, and the angle accounts for the terrain slope beneath it. Wind changes between turns and accelerates shots horizontally. There is no trajectory preview; the server computes the actual shot.
- Loom fires a precise thread orb with a moderate blast. Manta fires two diverging aqua seeds. Borer fires a heavy drill shell with a wider crater. Explosions damage players within a radius and deform the ground; Mobiles settle onto the new surface.
- Each player begins with one of each item. Double boosts the next shot and can be armed during the turn. Repair restores 28 HP and spends the turn. Teleport arms a portal projectile using the same aim and power controls as a normal shot. The Mobile moves to its unoccupied ground impact point and spends the turn.
- A player at zero HP is out. The last living player wins. If all remaining players are eliminated by one shot, the round is a draw. A disconnected player forfeits their place in an active round.
- The map theme and terrain seed are randomized on every start. The first version has Cloud Reef, Clockwork Orchard, and Glass Dunes.

## Technical scope

- Phaser 3 + TypeScript + Vite for the 2D playfield; HTML/CSS for lobby and HUD.
- Node.js + WebSocket server owns rooms, turn timer, terrain, physics, damage, items, and victory. Browser clients send actions and render snapshots.
- One Node process holds rooms in memory. No accounts, matchmaking, persistence, or public deployment in this version. Reconnection after a dropped connection is not yet supported.
- Generated backgrounds, transparent Mobile sprites, item icons, and rock textures are rendered in Phaser. The server's numeric terrain and hit detection remain deterministic and independent of those images.

## Art

The approved look uses layered floating islands, luminous rims, clouds, and waterfalls. ImageGen produced three background plates, three matching rock textures, three transparent Mobile cutouts, and three item icons. The playfield clips rock textures to the authoritative terrain shape and adds decorative water, foliage, and surface lighting without affecting collisions.
