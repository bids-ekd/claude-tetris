# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Tetris clásico implementado en JavaScript vanilla (sin frameworks, sin build, sin dependencias). Todo el proyecto son tres archivos estáticos: `index.html`, `style.css`, `game.js`.

## Running the game

No hay build ni tests. Para jugar, sirve los archivos estáticamente y abre en el navegador:

```bash
python3 -m http.server 8000   # o: npx serve .
```

Abrir el `index.html` directamente con doble clic también funciona (`file://`), ya que no hay módulos ES ni fetch a otros archivos.

No existe `package.json`, linter ni suite de tests configurada en el repo.

## Architecture (`game.js`)

Todo el estado del juego vive en variables globales a nivel de módulo (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) — no hay clases ni un objeto de estado central. Al modificar lógica de juego, ten en cuenta que las funciones mutan estas globales directamente en vez de recibir/devolver estado.

Piezas de flujo clave:

- **Tablero**: matriz `ROWS × COLS` (20×10); cada celda es `0` (vacía) o un índice 1–7 que indica el color/tipo de pieza.
- **Piezas** (`PIECES`): matrices cuadradas fijas; `rotateCW` rota transponiendo + invirtiendo filas (no usa SRS, es una rotación simple).
- **Colisión** (`collide`): única función que valida límites del tablero y solapes; toda la lógica de movimiento pasa por ella antes de mutar `current.x/y`.
- **Wall kicks** (`tryRotate`): tras rotar, prueba desplazamientos `[0, -1, 1, -2, 2]` en columnas hasta encontrar uno sin colisión.
- **Game loop** (`loop`): un único `requestAnimationFrame` que acumula `dt` en `dropAccum` y baja la pieza cuando supera `dropInterval`; no hay loop de física separado del render.
- **Ghost piece**: `ghostY()` proyecta la posición final de caída recorriendo `collide` hacia abajo; se dibuja con alpha reducido antes que la pieza actual.
- **Línea completa / puntuación**: `clearLines` recorre de abajo hacia arriba, usa `LINE_SCORES = [0,100,300,500,800]` multiplicado por `level`; el nivel sube cada 10 líneas y recalcula `dropInterval = max(100, 1000 − (level−1)×90)`.
- **Renderizado**: dos canvases separados — `#board` (tablero + pieza + ghost) y `#next-canvas` (preview de la siguiente pieza) — cada uno con su propio contexto 2D y función `draw()`/`drawNext()`.

Al tocar parámetros de tablero (`COLS`, `ROWS`, `BLOCK` en `game.js`), hay que ajustar también `width`/`height` del `<canvas id="board">` en `index.html` para que coincidan (`COLS × BLOCK`, `ROWS × BLOCK`).

## Idioma

El README, los textos de UI (overlay, HUD) y los comentarios existentes están en español. Mantener ese idioma al añadir texto visible para el usuario o comentarios nuevos.
