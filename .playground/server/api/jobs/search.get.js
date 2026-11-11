const jobs = [
	{
		id: 1,
		title: 'Frontend Developer',
		teaser: 'Build accessible web experiences with Vue and Nuxt.',
		url: '/jobs/frontend-developer',
	},
	{
		id: 2,
		title: 'Backend Developer',
		teaser: 'Design reliable APIs and services for growing products.',
		url: '/jobs/backend-developer',
	},
	{
		id: 3,
		title: 'Product Designer',
		teaser: 'Turn user needs into clear, useful product experiences.',
		url: '/jobs/product-designer',
	},
	{
		id: 4,
		title: 'Technical Project Manager',
		teaser: 'Help teams deliver thoughtful digital products.',
		url: '/jobs/project-manager',
	},
];

export default defineEventHandler((event) => {
	const query = getQuery(event);
	const searchTerm = String(query.text || '').trim().toLowerCase();
	const filteredJobs = searchTerm
		? jobs.filter((job) =>
				`${job.title} ${job.teaser}`.toLowerCase().includes(searchTerm)
			)
		: jobs;
	const requestedLimit = Number.parseInt(query.limit, 10);
	const requestedOffset = Number.parseInt(query.offset, 10);
	const limit =
		Number.isFinite(requestedLimit) && requestedLimit > 0
			? requestedLimit
			: 3;
	const offset =
		Number.isFinite(requestedOffset) && requestedOffset > 0
			? requestedOffset
			: 0;

	return {
		data: filteredJobs.slice(offset, offset + limit),
		pagination: {
			limit,
			offset,
			total: filteredJobs.length,
		},
	};
});
