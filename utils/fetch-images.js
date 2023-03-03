import crypto from 'crypto';
import * as dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { env } from 'node:process';
import { Configuration, OpenAIApi } from 'openai';

dotenv.config();

const papers = JSON.parse(readFileSync('./src/data/papers.json', 'utf8'));

const config = new Configuration({
	apiKey: env.OPENAI_API_KEY
});
const openai = new OpenAIApi(config);

const images = papers
	.filter((p) => !!p.prompt)
	.map(async (paper) => {
		const completion = await openai.createImage({
			prompt:
				paper.prompt +
				' blade runner, cyberpunk, vaporwave, sci-fi, neon, high res, painted by Thomas Kinkade',
			size: '1024x1024',
			response_format: 'url',
			n: 1
		});

		console.log('Grepping', paper.prompt);

		try {
			return {
				image: completion.data.data[0].url,
				id: crypto.createHash('md5').update(paper.link).digest('hex')
			};
		} catch (e) {
			console.log(e);
			return null;
		}
	});

const newImages = await Promise.all(images);

writeFileSync(
	'./src/data/images/wget-images.sh',
	newImages.map((image) => `wget -O ${image.id}.jpg "${image.image}"`).join('\n')
);
