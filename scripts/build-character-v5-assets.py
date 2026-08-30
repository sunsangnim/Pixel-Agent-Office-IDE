from pathlib import Path

import numpy as np
import cv2
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path.home() / "AppData/Roaming/orca/codex-runtime-home/home/generated_images/01a04e0d-71ff-75b0-b9ed-95b76032a673"
OUT = ROOT / "src/renderer/src/assets/pixel-office/characters/complete-v5"
CELL = 192

FILES = {
    "claude-manager": "exec-dd053aaa-8c91-4dc1-95ef-e48abd1a6fdf.png",
    "claude-employee-1": "exec-a246f6d7-a0c9-4e06-9fab-8c729c3ed849.png",
    "claude-employee-2": "exec-d17a70e4-866d-4a2b-8875-fa2d1b8f9d5b.png",
    "claude-employee-3": "exec-95ca005d-98c8-40dd-af0c-f8199398c279.png",
    "claude-employee-4": "exec-5238bb12-3a7c-4290-a61e-cb3a91fb8159.png",
    "codex-deputy-manager": "exec-71dac8f0-791a-471a-a5c1-1799bcfbe8d5.png",
    "codex-employee-1": "exec-c8099e42-ee12-402c-8f27-18ef09b23132.png",
    "codex-employee-2": "exec-cdbdf596-6af9-4105-ad60-5624c2fcae16.png",
    "codex-employee-3": "exec-3536047e-b817-4477-ab31-5204fb38ff67.png",
    "codex-employee-4": "exec-e926ad74-a3aa-41b3-a403-1607f1ef1d59.png",
    "antigravity-manager": "exec-929a8e76-8e1d-4e15-a3b5-29752558dc78.png",
    "antigravity-employee-1": "exec-ed3c32b8-fc8d-4ac5-9ad3-e680d9e7e6cf.png",
    "antigravity-employee-2": "exec-7bffd270-a3da-4ec3-84cb-1135c79ad7c4.png",
    "antigravity-employee-3": "exec-5917a58b-e999-4ed7-b024-454ecadc23f0.png",
    "antigravity-employee-4": "exec-61907895-984c-4af4-8a24-6913b7439ed7.png",
    "employee-16": "exec-bd6cfdd9-e8dd-4787-bda9-8742348b4d04.png",
    "employee-17": "exec-d4c8073b-7c46-4234-99c1-73ddf5100787.png",
    "employee-18": "exec-06234bc2-53b6-494a-a62f-199086ffb63b.png",
    "employee-19": "exec-e0dab678-7845-4764-a979-174eccff1bea.png",
    "employee-20": "exec-ece9345e-90d4-409a-a916-56a4457ae41f.png",
}

ROW_NAMES = [
    "stand-front", "walk-front", "walk-back", "walk-left", "walk-right",
    "sit-front", "sit-back", "sit-left", "sit-right", "work-front",
    "work-back", "work-left", "work-right", "drink",
]


def key_green(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgb = rgba[:, :, :3].astype(np.int16)
    green = (rgb[:, :, 1] > 45) & ((rgb[:, :, 1] - rgb[:, :, 0]) > 32) & ((rgb[:, :, 1] - rgb[:, :, 2]) > 32)
    rgba[:, :, 3] = np.where(green, 0, 255).astype(np.uint8)
    return Image.fromarray(rgba)


def row_sprites(row: Image.Image) -> list[Image.Image]:
    alpha = np.asarray(row.getchannel("A")) > 0
    occupied = alpha.sum(axis=0) > 2
    spans, start = [], None
    for x, value in enumerate(np.r_[occupied, False]):
        if value and start is None:
            start = x
        elif not value and start is not None:
            if x - start > 12:
                crop = row.crop((start, 0, x, row.height))
                box = crop.getchannel("A").getbbox()
                if box:
                    spans.append(crop.crop(box))
            start = None
    return spans


def clustered_blocks(source: Image.Image) -> tuple[list[list[Image.Image]], list[list[Image.Image]]]:
    alpha = (np.asarray(source.getchannel("A")) > 0).astype(np.uint8)
    count, _, stats, centers = cv2.connectedComponentsWithStats(alpha, 8)
    items = []
    minimum_height = source.height / 14 * 0.42
    for index in range(1, count):
        x, y, width, height, area = stats[index]
        if area > 240 and height > minimum_height and width > 14:
            items.append((float(centers[index][1]), x, source.crop((x, y, x + width, y + height))))
    if len(items) < 42:
        raise RuntimeError(f"only {len(items)} complete sprites detected")
    blocks = []
    for side in (0, 1):
        block = [item for item in items if (item[1] + item[2].width / 2 < source.width / 2) == (side == 0)]
        values = np.array([item[0] for item in block], dtype=np.float32)
        centers_y = np.linspace(values.min(), values.max(), 7)
        for _ in range(30):
            labels = np.abs(values[:, None] - centers_y[None, :]).argmin(axis=1)
            updated = np.array([values[labels == i].mean() if np.any(labels == i) else centers_y[i] for i in range(7)])
            if np.allclose(updated, centers_y):
                break
            centers_y = updated
        rows = [[] for _ in range(7)]
        for item, label in zip(block, labels):
            rows[int(label)].append((item[1], item[2]))
        blocks.append([[sprite for _, sprite in sorted(row, key=lambda entry: entry[0])] for row in rows])
    return blocks[0], blocks[1]


def projected_grid(source: Image.Image) -> list[list[Image.Image]]:
    alpha = np.asarray(source.getchannel("A")) > 0
    occupied = alpha.sum(axis=0) > 10
    spans, start = [], None
    for x, value in enumerate(np.r_[occupied, False]):
        if value and start is None:
            start = x
        elif not value and start is not None:
            if x - start > 15:
                spans.append((start, x))
            start = None
    rows = []
    row_height = source.height / 7
    for row_index in range(7):
        target_y = (row_index + 0.5) * row_height
        y0 = max(0, round((row_index - 0.28) * row_height))
        y1 = min(source.height, round((row_index + 1.28) * row_height))
        sprites = []
        for x0, x1 in spans:
            crop = source.crop((x0, y0, x1, y1))
            mask = (np.asarray(crop.getchannel("A")) > 0).astype(np.uint8)
            count, _, stats, centers = cv2.connectedComponentsWithStats(mask, 8)
            choices = []
            for index in range(1, count):
                x, y, width, height, area = stats[index]
                center_global = y0 + centers[index][1]
                if area > 180 and height > row_height * 0.35:
                    choices.append((abs(center_global - target_y), area, (x, y, width, height)))
            if choices:
                _, _, (x, y, width, height) = min(choices, key=lambda item: (item[0], -item[1]))
                sprites.append(crop.crop((x, y, x + width, y + height)))
        rows.append(sprites)
    return rows


def fit(sprite: Image.Image) -> Image.Image:
    sprite = sprite.copy()
    sprite.thumbnail((CELL - 28, CELL - 24), Image.Resampling.NEAREST)
    cell = Image.new("RGBA", (CELL, CELL))
    cell.alpha_composite(sprite, ((CELL - sprite.width) // 2, CELL - sprite.height - 12))
    return cell


def frames_for(frames: list[Image.Image]) -> list[Image.Image]:
    if not frames:
        raise RuntimeError("missing animation frames")
    return [fit(frames[index % len(frames)]) for index in range(8)]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, filename in FILES.items():
        source = key_green(Image.open(SOURCE / filename))
        states: list[list[Image.Image]] = [[] for _ in range(14)]
        counts = []
        for row_index, sprites in enumerate(projected_grid(source)):
            if len(sprites) < 6:
                raise RuntimeError(f"{name} source row {row_index} has {len(sprites)} sprites")
            left = sprites[:4]
            right = sprites[4:] if len(sprites) == 7 else sprites[-4:]
            states[row_index] = left
            states[row_index + 7] = right
            counts.append(len(sprites))
        # This source has drinks sharing its final projected band instead of a
        # dedicated right-facing work strip. Mirror the clean left-facing work
        # frames so the opposite cardinal direction stays complete and crisp.
        if name == "employee-19":
            states[12] = [frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for frame in states[11]]
        atlas = Image.new("RGBA", (CELL * 8, CELL * 14))
        for state_index, state in enumerate(states):
            for frame_index, frame in enumerate(frames_for(state)):
                atlas.alpha_composite(frame, (frame_index * CELL, state_index * CELL))
        atlas.save(OUT / f"{name}-v5.png")
        print(f"{name}: source-row-counts={counts}")


if __name__ == "__main__":
    main()
