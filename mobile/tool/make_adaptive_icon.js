/**
 * Собирает foreground-слой адаптивной Android-иконки из assets/icon.png.
 *
 * Исходник — белое сердце со свечением на почти чёрном фоне. Адаптивной
 * иконке нужен передний слой на прозрачности, поэтому берём яркость пикселя
 * как альфу: сердце остаётся плотным, свечение превращается в мягкий
 * градиент прозрачности, фон уходит в ноль. Цвет при этом принудительно
 * белый, иначе тёмная подложка исходника мутит края.
 *
 * Запуск (canvas лежит в node_modules корня репозитория):
 *   node mobile/tool/make_adaptive_icon.js
 */
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const SRC = path.join(__dirname, '..', 'assets', 'icon.png');
const OUT = path.join(__dirname, '..', 'assets', 'icon_foreground.png');

/// Ниже этого уровня яркости считаем, что это фон, а не свечение.
const FLOOR = 14;

async function main() {
	const image = await loadImage(SRC);
	const size = Math.max(image.width, image.height);
	const canvas = createCanvas(size, size);
	const ctx = canvas.getContext('2d');
	ctx.drawImage(image, 0, 0, size, size);

	const frame = ctx.getImageData(0, 0, size, size);
	const px = frame.data;
	for (let i = 0; i < px.length; i += 4) {
		const luminance = Math.max(px[i], px[i + 1], px[i + 2]);
		// Растягиваем оставшийся диапазон обратно до 0..255, чтобы
		// срез фона не съел яркость самого сердца.
		const alpha = luminance <= FLOOR
			? 0
			: Math.round(((luminance - FLOOR) / (255 - FLOOR)) * 255);
		px[i] = 255;
		px[i + 1] = 255;
		px[i + 2] = 255;
		px[i + 3] = alpha;
	}
	ctx.putImageData(frame, 0, 0);

	fs.writeFileSync(OUT, canvas.toBuffer('image/png'));
	console.log(`ok: ${OUT} (${size}x${size})`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
