import { writeFileSync } from 'fs';
import { get } from 'https';
import { parseString } from 'xml2js';

const rssUrl = 'https://export.arxiv.org/rss/cs/new';

get(rssUrl, (res) => {
	let rssData = '';

	res.on('data', (chunk) => {
		rssData += chunk;
	});

	res.on('end', () => {
		parseString(rssData, (err, result) => {
			if (err) {
				console.error(err);
			} else {
				if (result['rdf:RDF']?.item !== undefined) {
					const papers = result['rdf:RDF'].item.map((item) => {
						return {
							title: item.title[0].replace(/\(arXiv.*/g, '').replace(/\.\s$/g, ''),
							link: item.link[0],
							abstract: item['description'][0]['_']
								?.replace(/<[^>]*>/g, '')
								.replace(/\n/g, ' ')
								.replace(/\s{2}$/g, '')
						};
					});
					writeFileSync('./src/data/source-papers.json', JSON.stringify(papers));
				} else {
					console.error('No papers found');
				}
			}
		});
	});
}).on('error', (err) => {
	console.error(err);
});
