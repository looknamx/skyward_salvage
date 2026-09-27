# Skyward Salvage — playable first version

An original side-view, turn-based artillery game for 2–4 friends in a private browser room. The visual direction follows the approved floating-island concept images in `../turn_artillery_concept/`.

## Rules

- One player creates a room and shares its code or link. In the lobby each player chooses Loom, Manta, Borer, Vesper, or Bramble. Guests mark themselves ready; the host starts when 2–4 players have joined and all guests are ready. Changing the mode or joining the room clears guest readiness.
- Players act in join order. A turn lasts 30 seconds. A timed-out turn passes to the next living player.
- Move with the left and right arrow keys or A/D at 88 world units per second, up to 350 world units of cumulative walking per turn, following the ground and stopping before another Mobile. Walking faces the Mobile in that direction; R flips it in place. The server owns position and facing and broadcasts both to every client.
- Adjust the 10–80 degree aim from the Mobile's front with the up and down arrow keys or W/S; the angle stays at its last setting on the next turn. Hold Fire or Space to charge power smoothly from 5% to 100% over 2.4 seconds, then release to shoot. The shot starts at the front of the Mobile, and the angle accounts for the terrain slope beneath it. On each new turn wind has a 20% chance to change and accelerates shots horizontally. There is no trajectory preview; the server computes the actual shot.
- Loom fires a precise thread orb with a moderate blast. Manta fires two diverging aqua seeds. Borer fires a heavy drill shell with a wider crater. Vesper's energy orb resists wind, and its special ignores wind entirely. Bramble's seed mortar has a moderate blast and its special also restores 22 HP to itself. Explosions damage players within a radius and deform the ground; Mobiles settle onto the new surface.
- In the lobby, each player may commit to a random Mobile once per room. The lobby shows only that the roll is pending. After the host starts the round, the server uses a secure roll with a 5% chance of Aegis, a rare 150 HP Mobile, and reveals the result to everyone in the gameplay state. Other rolls choose one of the five ordinary 100 HP Mobiles. Aegis cannot be selected directly.
- Each player begins with one of each item. Double boosts the next shot and can be armed during the turn. Repair restores 28 HP and spends the turn. Teleport arms a WARP projectile using the same aim and power controls as a normal shot. The Mobile moves to its unoccupied ground impact point and spends the turn.
- A player at zero HP is out. The last living player wins in free for all mode. In 2v2, alternating join order assigns teams and teammates cannot damage each other. The last living team wins. If all remaining players are eliminated by one shot, the round is a draw.
- Each Mobile begins each round with one special shot: Loom trades blast radius for precise damage, Manta splits into three shots, Borer makes a larger blast, Vesper ignores wind, Bramble heals itself, and Aegis fires a stronger blast. Every eighth turn drops a random item: Double, Repair, and Teleport each have a 30% chance, while a Special refill has a 10% chance. A player can collect the Special refill only after spending their current special shot, and the other drops only when the matching item slot is empty.
- Players disconnected for up to 45 seconds can resume using a browser session token. Their active turn advances immediately. After the grace period, they are eliminated from an active match. All connected players may mark themselves ready for a rematch in the same room.
- The map theme and terrain seed are randomized on every start. The first version has Cloud Reef, Clockwork Orchard, and Glass Dunes.

## Technical scope

- Phaser 3 + TypeScript + Vite for the 2D playfield; HTML/CSS for lobby and HUD.
- Node.js + WebSocket server owns rooms, turn timer, terrain, physics, damage, items, and victory. Browser clients send actions and render snapshots.
- One Node process holds rooms and match statistics in memory. The result screen shows player statistics. There are no accounts, matchmaking, persistent records, or public deployment in this version.
- WebSocket upgrades validate origin; commands have payload and rate limits; ping/pong removes stale sockets. `ALLOWED_ORIGINS` can restrict deployment origins explicitly.
- Generated backgrounds, transparent Mobile sprites, item icons, and rock textures are rendered in Phaser. The server's numeric terrain and hit detection remain deterministic and independent of those images.

## Art

The approved look uses layered floating islands, luminous rims, clouds, and waterfalls. ImageGen produced three background plates, three matching rock textures, five transparent Mobile cutouts, and three item icons. The playfield clips rock textures to the authoritative terrain shape and adds decorative water, foliage, and surface lighting without affecting collisions.
