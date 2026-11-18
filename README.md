# G-Force Flight Simulator

A 3D aerial combat game that runs directly in the browser. Fly an aircraft, defend against enemy waves, and survive gunfire, collisions, and extreme accelerations.

## Play

**[PLAY](https://obiwan-gthub.github.io/Operation-Skyfire/)**

Open the HTML file in a modern browser, then click **Décoller**.

The game loads [Three.js](https://threejs.org/) from a CDN, so an internet connection is required to display the 3D scene.

## Controls

| Action | Key |
|---|---|
| Pilot the aircraft | Mouse |
| Fire a missile | Left click |
| Increase throttle | `W` |
| Reduce throttle / air brakes | `S` |
| Afterburner | `Shift` |
| Strafe right / left | `D` / `A` |
| Move up / down | `Space` / `C` |
| Anti-G straining maneuver | Hold `E` |
| Release mouse control | `Esc` |

Your browser will capture the mouse after starting the game. Click inside the game window again if mouse control is released.

## Features

- 3D flight controls using the keyboard and mouse.
- Multiple enemy aircraft waves.
- Lock-on target indicator.
- Homing missiles.
- Radar, score, and aircraft hull status.
- Explosions, debris, smoke, particles, and sound effects.
- G-force simulation, tunnel vision, redout, and G-LOC.

## Run Locally

Open `index.html` directly in a browser, or start a local server:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## Deploy on GitHub Pages

1. Add the HTML file and this `README.md` to a GitHub repository.
2. Make sure the main HTML file is named `index.html`.
3. Open **Settings → Pages** in the repository.
4. Select **Deploy from a branch**.
5. Choose the `main` branch and the `/ (root)` folder.
6. Click **Save**.

The public game URL will appear in the GitHub Pages section. Deployment may take a few minutes.
