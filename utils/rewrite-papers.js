import * as dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { env } from 'node:process';
import { Configuration, OpenAIApi } from 'openai';

dotenv.config();

const sourcePapers = JSON.parse(readFileSync('./src/data/source-papers.json', 'utf8')).slice(0, 15);

const config = new Configuration({
	apiKey: env.OPENAI_API_KEY
});
const openai = new OpenAIApi(config);

// type Paper = {
//     title: string;
//     link: string;
//     abstract: string;
//     keywords: string[];
// };

const papers = sourcePapers.map(async (paper) => {
	const completion = await openai.createChatCompletion({
		model: 'gpt-3.5-turbo',
		messages: [
			{
				role: 'system',
				content:
					'For a futuristic cyberpunk magazine write an article with a sensationalized title, click-bait intro, and 1000 word text based on the title and abstract of a scientific paper. The article should be written so that a layman can understand it. Tone should always be very optimistic and futuristic. User will provide you with a title and abstract. Provide up to five keywords. Provide a prompt for an image generating AI like Dall-E. Do not use the word Revolutionizing. Strictly respond with a JSON object using the following format:\n' +
					'{\n' +
					'  "title": ${title},\n' +
					'  "intro": ${intro},\n' +
					'  "text": ${text},\n' +
					'  "keywords": ${keywords},\n' +
					'  "prompt": ${prompt}\n' +
					'}'
			},
			{
				role: 'user',
				content: `{"title": ${paper.title},\n"abstract": ${paper.abstract}}`
			}
		]
	});
	const result = completion.data.choices[0].message.content
		.replace(/\n\n\n/g, '\\n\\n\\n')
		.replace(/\n\n/g, '\\n\\n');

	try {
		const newPaper = JSON.parse(result);
		return {
			...newPaper,
			link: paper.link,
			slug: newPaper.title?.toLowerCase().replace(/[^a-z0-9]/g, '-')
		};
	} catch (e) {
		console.log('Dropping non-JSON result');
	}

	return false;
});

const result = await Promise.all(papers);

writeFileSync(
	'./src/data/papers.json',
	JSON.stringify(
		result.filter(
			(paper) =>
				!!paper && paper.title && paper.text && paper.intro && paper.keywords && paper.prompt
		)
	)
);
