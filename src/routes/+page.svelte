<script>
	import papers from '../data/papers.json';
</script>

<h1>CYBERPUNK</h1>

{#each papers as paper}
	<h2>{paper.title}</h2>
	<p>{paper.abstract}</p>
{/each}
