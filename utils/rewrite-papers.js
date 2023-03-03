import * as dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { env } from 'node:process';
import { Configuration, OpenAIApi } from 'openai';

dotenv.config();

const sourcePapers = JSON.parse(readFileSync('./src/data/source-papers.json', 'utf8')).slice(0, 10);

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
					'We are creating a magazine. For this, you rewrite a scientific paper in the form of cyberpunk a cyberpunk like Neuromancer from William Gibson. Tone should always be optimistic and futuristic. Text should be converted to third person, if necessary. User will provide you with a title and abstract, your response will be the rewritten title and abstract. Provice up to five keywords. Provide a prompt for an image generating AI like Dall-E, too.'
			},
			{
				role: 'system',
				content:
					'Response should be in JSON using the following format:\n' +
					'{"title": ${title},\n"abstract": ${abstract},\n"keywords": ${keywords},\n"prompt": ${prompt}'
			},
			{
				role: 'user',
				content: `{"title": ${paper.title},\n"abstract": ${paper.abstract}}`
			}
		]
	});

	try {
		let result = completion.data.choices[0].message.content;
		return JSON.parse(result);
	} catch (error) {
		console.error(error);
		console.error(completion.data.choices[0].message.content);
	}
	return false;
});

const result = await Promise.all(papers);

writeFileSync('data/papers.json', JSON.stringify(result.filter((paper) => !!paper)));
