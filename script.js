/** @typedef {number} ID */
/** @typedef {string} Tag */
/** @typedef {{[tag: Tag]: Cats<number>}} TagData */
/** @typedef {{[id: ID]: Tag[]}} PostData */
/**
 * @template T
 * @typedef {T[]} Cats
 */
/**
 * Processed Post with all its relevant information.
 * @typedef Post
 * @prop {ID} id Post's e621 id.
 * @prop {Tag[]} tags List of e621 tags.
 * @prop {string} preview Link of post's small preview image file.
 * @prop {string} file Link of post's full image file.
 * @prop {string} type Post's type (image/video).
 * @prop {number} cat Category index of post (-1 if unseen).
 * @prop {{favs: number, score: number, probs: Cats<number>}} vals Post's relevant measurements (#favs, score, calculated score).
 */

/**
 * [Title, Colour, Icon]
 * @typedef {Cats<string[]>}
 */
const CATS = [
	['Revultion',   'red',           'sentiment_extremely_dissatisfied'],
	['Dislike',     'orangered',     'sentiment_stressed'],
	['Unimpressed', 'lightpink',     'sentiment_dissatisfied'],
	['Neutral',     'gray',          'sentiment_neutral'],
	['Appreciate',  'lightskyblue',  'sentiment_content'],
	['Like',        'royalblue',     'sentiment_satisfied'],
	['Adore',       'rebeccapurple', 'sentiment_excited'],
	['Obsessed',    'deeppink',      'favorite'],
];
const NCats = CATS.length;

/**
 * Basic Authentication
 * 
 * "Basic " followed by "\<Username\>:\<API Token\>" encoded in Base64.
 * @type {string}
 */
var auth = null;
/**
 * Keeps track of all Tags the user has encountered, their reations to them, and their totals.
 * @type {{totals: Cats<number>, tags: TagData}}
 */
var counts = null;
/**
 * Stores the post IDs that the user has previously seen in their respective categories.
 * @type {Cats<ID[]>}
 */
var reacted = null;
// /** @type {{id: ID, preview: string, file: string, type: string}[]} */
// var saved = null;
/** @type {{priors: Cats<number>, comb_w: Cats<number>, tags: TagData}} */
var model = null;
/** @type {Post[]} */
var results = [];
/** @type {Post[]} */
var filtered = [];

var currPost = -1;
var currPage =  0;
var endPage  =  0;

var postsPerPage = 180;

/**
 * Look-Up-Table for e621's tag category numbers and their associated colours.
 */
const tagCatColour = [
	'#2e76b4', // General
	'#fbd67f', // Artist
	'#ff5eff', // Copyright
	'#2bff2b', // Character
	'#f6b295', // Species
	'#ff3d3d', // Invalid
	'#ffffff', // Meta
	'#228822', // Lore
];
/**
 * Look-Up-Table to convert posts
 */
const e6RatingConvTable = {
	dislike: 1,
	like:    4,
	fav:     5,
	favlike: 6,
}

initDOM();

// DOM Elements
const logBtn   = document.querySelector('#log-btn');
const grid     = document.querySelector('#img-grid');
const query    = document.querySelector('#query');
const autocomp = document.querySelector('#autocomplete');
const filter   = document.querySelector('#filter');
const sort     = document.querySelector('#sort');
const reverse  = document.querySelector('#reverse');
const back     = document.querySelector('#back');
const ori      = document.querySelector('#ori');
const fav      = document.querySelector('#fav');
const like     = document.querySelector('#like');
const dislike  = document.querySelector('#dislike');
const upload   = document.querySelector('#upload');
const titleSt  = document.querySelector('#state label');
const iconSt   = document.querySelector('#state label i');
const srcBtn   = document.querySelector('#src-btn');
const srcIcn   = document.querySelector('#src-btn span');
const favs     = document.querySelector('#favs');
const score    = document.querySelector('#score');
const comb     = document.querySelector('#comb');
const prefetch = document.querySelector('#prefetch');
const intBtns  = document.querySelector('#interaction-buttons');
const pProbs   = document.querySelectorAll('.post-probs');
const pageNums = document.querySelectorAll('.page-numbers');
const rateBtns = document.querySelectorAll('.rate-buttons');

upload.addEventListener('change', (event) => {
	const file = event.target.files[0];
	if (file) uploadData(file);
});
window.addEventListener('beforeunload', () => {
	storeData();
});
query.addEventListener('keyup', async (event) => {
	if (event.keyCode == 13) search(); // ENTER
	else if (event.keyCode == 8) autocomp.style.display = 'none'; // BACKSPACE
	else {
		const tag = /[\w\(\)]+(?=\?)/.exec(query.value);
		if (tag == null) return;
		
		const tags = await searchTag(tag[0]);
		autocomp.replaceChildren();
		tags.forEach(tag => {
			let li       = document.createElement('li');
			let name     = document.createElement('span');
			let count    = document.createElement('i');
			let unseen_c = document.createElement('i');
			
			li.onclick           = autocomplete;
			name.innerText       = tag.name;
			name.style.color     = tagCatColour[tag.cat];
			count.innerText      = tag.count;
			unseen_c.innerText   = tag.count - sum(counts.tags[tag.name]??[0]);
			unseen_c.style.color = 'grey';
			
			li.appendChild(name);
			li.appendChild(count);
			li.appendChild(unseen_c);
			autocomp.appendChild(li);
		});
		
		autocomp.style.display = 'block';
	}
});

initData();

function initDOM() {
	const rateBtns  = document.querySelector('#rate-buttons');
	const postProbs = document.querySelector('#post-probs');
	const sorts     = document.querySelector('#sort');
	for (const i in CATS) {
		let btn  = document.createElement('button');
		let icon = document.createElement('i');
		let span = document.createElement('span');
		let opt  = document.createElement('option');
		
		btn.onclick = ratePost;
		icon.style.fontSize = '2rem';
		icon.className   = 'material-symbols-outlined';
		span.className   = 'post-probs';
		btn.className    = 'rate-buttons';
		opt.value        = i;
		btn.value        = i;
		span.innerText   = 0;
		opt.innerText    = CATS[i][0];
		btn.title        = CATS[i][0];
		span.title       = CATS[i][0];
		icon.style.color = CATS[i][1];
		span.style.color = CATS[i][1];
		icon.innerText   = CATS[i][2];
		
		btn.appendChild(icon);
		rateBtns.appendChild(btn);
		postProbs.appendChild(span);
		sorts.appendChild(opt);
	}
	
	// let save = document.createElement('button');
	// let icon = document.createElement('i');
	
	// save.onclick = savePost;
	// icon.style.fontSize = '2rem';
	// save.title       = 'Save';
	// icon.className   = 'material-symbols-outlined';
	// icon.style.color = 'green';
	// icon.innerText   = 'bookmark';
	
	// save.appendChild(icon);
	// rateBtns.appendChild(save);
}
/**
 * Loads data from Local Storage.
 */
async function initData() {
	setState('Loading Data', 'database');
	
	// Login
	auth = localStorage.getItem('auth');
	if (auth != null) {
		intBtns.style.display = 'flex';
		logBtn.title   = 'Logout';
		logBtn.onclick = logout;
		logBtn.firstChild.innerText = 'logout';
	}
	
	// Get seen post IDs
	reacted = JSON.parse(localStorage.getItem('reacted'));
	if (reacted == null) {
		reacted = new Array(NCats);
		for (let i = 0; i < NCats; i++) reacted[i] = [];
	}
	
	// Search for Reacted Posts
	counts = JSON.parse(localStorage.getItem('counts'));
	if (counts == null) {
		counts = {
			totals: new Array(NCats).fill(0),
			tags: {},
		};
	}
	
	// Initialise an empty model
	model = {
		priors: new Array(NCats).fill(0),
		comb_w: new Array(NCats).fill(0),
		tags: {},
	};
	
	setState();
}
/**
 * @this {HTMLElement}
 */
function autocomplete() {
	query.value = query.value.replace(/\w+\?/, this.firstChild.innerText + ' ');
	autocomp.style.display = 'none';
	query.focus();
}
/**
 * Saves the `counts` and `reacted` variables to the browser's local storage in JSON format.
 */
function storeData() {
	localStorage.setItem('counts',  JSON.stringify(counts));
	localStorage.setItem('reacted', JSON.stringify(reacted));
}
/**
 * The `search` function asynchronously searches for results based on user input and updates the
 * model accordingly.
 */
async function search() {
	if (srcBtn.disabled) return;
	currPost = -1;
	currPage =  0;
	pageNums.forEach(paginate => paginate.replaceChildren());
	grid.replaceChildren();
	results = [];
	wait = searchTags(query.value);
	updateModel();
	setState('Fetching Pages', 'wifi', true);
	await wait;
	setState();
	reEval(false);
}
/**
 * Queries the e621 API for JSON post pages.
 * Uses batches, the maximum amount of posts that will be retrieved can be calculated as
 * `320 * pagesPerCycle * cycleLimit`. (40 960 default)
 * @param {string} tags Query to be searched on e621's API.
 * @param {number} pagesPerCycle How many pages will be searched at the same time. (8 default)
 * @param {number} cycleLimit Maximum amount of cycles to be searched. (16 default)
 */
async function searchTags(tags, pagesPerCycle = 8, cycleLimit = 16) {
	const postLimit = 320;
	
	outer: for (let cycle = 0; cycle < cycleLimit; cycle++) {
		let promises = [];
		for (let page = cycle * pagesPerCycle +1; page <= (cycle + 1) * pagesPerCycle; page++) {
			const headers = auth != null ? {Authorization: auth} : undefined;
			promises.push(
				fetch(`https://e621.net/posts.json?limit=${postLimit}&page=${page}&tags=${tags}`, {
					headers
				}).then(res => res.json())
			);
		}
		
		const responses = await Promise.all(promises);
		for (const response of responses) {
			const posts = response.posts;
			addPosts(posts);
			if (posts.length < postLimit) break outer;
		}
	}
}
/**
 * Searches for autocompletions of a tag in e621.
 * @param {string} tag
 * @returns {Promise<{name: string, count: number, cat: number}[]>}
 */
async function searchTag(tag) {
	const headers = auth != null ? {Authorization: auth} : undefined;
	const res = await fetch(`https://e621.net/tags.json?limit=64&search[order]=count&search[name_matches]=${tag}*`, {
		headers
	}).then(res => res.json());
	
	let tags = [];
	res.forEach(tag => tags.push({
		name:  tag.name,
		count: tag.post_count,
		cat:   tag.category,
	}));
	
	return tags;
}
/**
 * Adds a post to the list of post results.
 * @param posts List of posts to be added from e621 JSON response. (see https://e621.net/help/api#posts_list)
 */
function addPosts(posts) {
	for (const post of posts) {
		results.push({
			id:      post.id,
			type:    post.duration == null ? 'img' : 'video',
			preview: post.preview.url,
			file:    post.file.url,
			tags:    extractTags(post.tags),
			cat:     getCat(post.id),
			// saved:   isSaved(post.id),
			vals: {
				score: post.score.total,
				favs:  post.fav_count,
				probs: new Array(NCats).fill(0),
			}
		});
	}
}
/**
 * Displays a paginated list of posts on a grid, filtering out skipped
 * posts and marking seen posts.
 */
function showPosts() {
	grid.replaceChildren();
	const START = postsPerPage * currPage;
	const END   = Math.min(START + postsPerPage, filtered.length);
	for (let i = START; i < END; i++) {
		const post = filtered[i];
		
		const article = document.createElement('article');
		const a       = document.createElement('a');
		const div     = document.createElement('div');
		const img     = document.createElement('img');
		
		if (wasSeen(post)) article.classList.add('seen');
		
		article.classList.add('preview');
		a.id = i;
		a.href = '#viewing-page';
		a.onclick = view;
		img.src = post.preview;
		div.innerText = getVal(post);
		
		a.appendChild(img);
		article.appendChild(a);
		article.appendChild(div);
		grid.appendChild(article);
	}
	
	paginate();
}
/**
 * Sorts and filters searched posts based on the user's choice.
*/
function filterPosts() {
	sortPosts();
	
	filtered = results.filter(post => !shouldSkipPost(post));
}
/**
 * Populates the page buttons.
 */
function paginate() {
	pageNums[0].replaceChildren();
	pageNums[1].replaceChildren();
	endPage = Math.ceil(filtered.length / postsPerPage) -1;
	for (let i = 0; i <= endPage; i++) {
		const btn0 = document.createElement('button');
		const btn1 = document.createElement('button');
		
		btn0.innerText = i;
		btn0.onclick = gotoPage;
		
		btn1.innerText = i;
		btn1.onclick = gotoPage;
		
		pageNums[0].appendChild(btn0);
		pageNums[1].appendChild(btn1);
	}
}
/**
 * Decides if the post should be skipped based on the filter selected by the user.
 * @param {Post} post
 * @returns {boolean}
 */
function shouldSkipPost(post) {
	const val = filter.value;
	if (val == 'all') return false;
	// if (val == 'seen' || val == 'unseen') // Always true for now
	return (val == 'unseen') == wasSeen(post); // XOR Hack
}
/**
 * Searches through the local data to see which reation the user had with that post.
 * @param {ID} id
 * @returns {number}
 */
function getCat(id) {
	for (const cat in CATS) if (reacted[cat].includes(id)) return cat;
	return -1;
}
/**
 * Sorts the search's resulted posts.
 */
function sortPosts() {
	results.sort((a, b) => {
		return getVal(b) - getVal(a);
	})
	if (reverse.checked) results.reverse();
}
/**
 * Returns the post's value relevant to the sorting requierement.
 * @param {Post} post
 * @returns {number}
 */
function getVal(post) {
	const val = sort.value;
	const idx = sort.selectedIndex;
	if (idx == 0) return combine(post.vals.probs);
	if (idx == 3) return post.id;
	if (idx <  3) return post.vals[val];
	return post.vals.probs[val];
}
/** @this {HTMLElement} */
function view() {
	currPost = parseInt(this.id);
	showBigPost();
}

function nextPost() {
	if (currPost >= results.length -1) return;
	currPost++;
	if (currPost >= postsPerPage * (currPage +1)) nextPage();
	showBigPost();
}

function prevPost() {
	if (currPost < 1) return;
	currPost--;
	if (currPost < postsPerPage * currPage) prevPage();
	showBigPost();
}

function nextPage() {
	if (currPage >= endPage) return;
	currPage++;
	showPosts();
}

function prevPage() {
	if (currPage <= 0) return;
	currPage--;
	showPosts();
}
/** @this {HTMLElement} */
function gotoPage() {
	currPage = parseInt(this.innerText);
	showPosts();
	return false;
}
/**
 * Loads the current selected post to the big viewer.
 */
function showBigPost() {
	let post = filtered[currPost];
	if (!wasSeen(post)) updatePost(post, 3);
	
	back.href = `#${currPost}`;
	ori.href  = `https://e621.net/posts/${post.id}`;
	document.getElementById(currPost).parentElement.classList.add('seen');
	
	favs.innerText  = post.vals.favs;
	score.innerText = post.vals.score;
	for (const i in CATS) pProbs.item(i).innerText = post.vals.probs[i];
	comb.innerText  = combine(post.vals.probs);
	setRateIndicator(post.cat);
	
	const bigMedia = document.createElement(post.type);
	bigMedia.src = post.file;
	bigMedia.id  = 'big-view';
	bigMedia.alt = 'Oops, something went wrong!\nCouldn\'t display media...';
	bigMedia.controls = true;
	bigMedia.loop     = true;
	document.querySelector('#big-view').replaceWith(bigMedia);
	
	// Prefetch next post
	if (currPost +1 < filtered.length) prefetch.src = filtered[currPost +1].file;
}
function setRateIndicator(cat) {
	rateBtns.forEach((btn) => {btn.classList.remove('set');});
	if (cat != -1) {rateBtns.item(cat).classList.add('set');}
}
/**
 * Evaluated the post using a custom Content-Based Filtering Recommender System, inspired by
 * the Naive Bayes Classifier.
 * @param {Tag[]} tags
 * @returns {Cats<number>}
 */
function evalPost(tags) {
	// Difference Naive Bayes
	/** @type {Cats<number>} */
	let probs = model.priors.slice();
	
	for (const tag of tags) {
		const update = model.tags[tag];
		if (update == undefined) continue;
		for (const cat in CATS) probs[cat] += update[cat];
	}
	
	return probs;
}
/** @param {number[]} arr */
function softmax(arr) {
	const max = Math.max(...arr);
	for (const i in arr) arr[i] = Math.exp(arr[i] - max);
	normalise(arr);
}
/**
 * @param {Iterable<number>} itr
 * @returns {number}
 */
function sum(itr) {
	let acc = 0;
	for (const v of itr) acc += v;
	return acc;
}
/**
 * @param {number[]} arr
 * @returns {number[]}
 */
function accumulate(arr) {
	var cum = arr.slice();
	
	let acc = 0;
	for (const i in arr) {
		acc += arr[i];
		cum[i] = acc;
	}
	
	return cum;
}
/** @param {number[]} arr */
function normalise(arr) {
	const total = sum(arr);
	for (const i in arr) arr[i] /= total;
}
/**
 * G-Test of Goodness Of Fit
 * @param {Cats<number>} priors
 * @param {Cats<number>} observed
 * @returns {number}
 */
function gGOFT(priors, observed) {
	let expected = priors.slice();
	const total = sum(observed);
	for (const i in priors) expected[i] *= total;
	
	let g = 0;
	for (const i in priors) if (observed[i] > 0) g += observed[i] * Math.log(observed[i] / expected[i]);
	
	return chi2cum(NCats -1, williamCorr(2*g, total, NCats));
}
/**
 * Binomial Goodness Of Fit Test
 * @param {number} prior
 * @param {number} observed
 * @param {number} total
 * @returns {number}
 */
function bGOFT(prior, observed, total) {
	// Aliases
	var   p = prior;
	const k = observed;
	const n = total;
	
	/** @type {number} */
	let pval = 0;
	if (total <= 512) { // Semi Exact Test
		const kp = binProb(p, k, n);
		pval = kp;
		// Left Tail
		for (let i = 0; i < k; i++) {
			const ip = binProb(p, i, n);
			if (ip > kp) break;
			pval += ip;
		}
		// Right Tail
		for (let i = n; i > k; i--) {
			const ip = binProb(p, i, n);
			if (ip > kp) break;
			pval += ip;
		}
	} else { // Approximation
		const e = p*n;
		const c = n-k;
		if (k > 0) pval += k * Math.log(k / e);
		if (c > 0) pval += c * Math.log(c / (n - e));
		pval = chi2cum(1, williamCorr(2*pval, n, 2));
	}
	
	return pval;
}
/**
 * Binomial Probability
 * @param {number} p Probability of Success
 * @param {number} i Observed Number of Successes
 * @param {number} n Total Number of Trials
 * @returns {number} Probability of observing that exact result
 */
function binProb(p, i, n) {
	if (p == 0 || p == 1) return 0;
	return Math.exp(lnChoose(n,i) + i*Math.log(p) + (n-i)*Math.log(1-p));
}
/**
 * Chi-Squared Cummulative Right Tail Distribution.
 * Gives the appropriate p-value for a Chi-Squared Goodness Of Fit Test.
 * 
 * Essentially: `Integral from chi2 to +Inf of t^(df/2-1)*e^(t/2)*2^(-df/2)/Gamma(df/2)*dt`
 * @param {number} df Degrees of Freedom
 * @param {number} chi2
 */
function chi2cum(df, chi2) {
	if (df < 0 || !Number.isInteger(df)) return NaN;
	const rem = df % 2;
	const lim = Math.floor(df/2);
	let res = lim > 0 ? 1 : 0;
	let div = 1;
	for (let i = 1; i < lim; i++) {
		div *= 2*i + rem;
		res += Math.pow(chi2, i) / div;
	}
	res *= Math.exp(-0.5*chi2);
	if (rem == 1) {
		res = 1 - erf(Math.sqrt(chi2*0.5)) + Math.sqrt(2*chi2/Math.PI) * res;
	}
	return res;
}
/**
 * William's Correction
 * @param {number} chi2
 * @param {number} n Total sample size
 * @param {number} k Number of Categories
 * @returns {number}
 */
function williamCorr(chi2, n, k) {
	const snv = 6 * n * (k - 1);
	const q = snv / (snv + k*k -1);
	return chi2 * q;
}
const lnfac_K = Math.log(2*Math.PI)/2;
/**
 * Approximation of `ln(x!)`
 * @param {number} x
 * @returns {number}
 */
function lnfac(x) {
	if (x <= 1.097952) return x*(x -1) / (2*Math.log(x + 2.325));
	return lnfac_K + Math.log(x)/2 + x*(Math.log(x + 1/(12*x)) -1);
}
const erf_K0 = 2/Math.sqrt(Math.PI);
const erf_K1 = erf_K0 * 11 / 123;
/**
 * Approximation of the Error Function
 * @param {number} x
 * @returns {number}
 */
function erf(x) {
	return Math.tanh(erf_K0*x + erf_K1*x*x*x);
}
const erfinv_K0 = 0.147;
const erfinv_K1 = 2/(Math.PI * erfinv_K0);
/**
 * Approximation of the inverse of the Error Function
 * @param {number} x
 * @returns {number}
 */
function erfinv(x) {
	if (x <= -1) return -Infinity;
	if (x >= +1) return +Infinity;
	
	const a = Math.log(1 - x*x);
	const b = erfinv_K1 + a/2;
	return Math.sign(x) * Math.sqrt(Math.sqrt(b*b - a/erfinv_K0) - b);
}
/**
 * Approximation of `ln(n choose k)`
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function lnChoose(n, k) {
	return lnfac(n) - (lnfac(k) + lnfac(n - k));
}
/**
 * Flattens the tags from the raw e621 post format.
 * @param {{[category: string]: Tag[]}} _tags
 * @returns {Tag[]}
 */
function extractTags(_tags) {
	let tags = [];
	delete _tags.invalid;
	for (const cat in _tags) tags.push(..._tags[cat]);
	return tags;
}
/**
 * Deletes all user data.
 */
function logout() {
	if (!confirm('Are you sure you want to logout?\nYou won\'t be able to rate posts on e621 through here.')) return;
	localStorage.removeItem('auth');
	auth = null;
	intBtns.style.display = 'none';
	logBtn.title   = 'Login';
	logBtn.onclick = login;
	logBtn.firstChild.innerText = 'login';
}
/**
 * Updates the model's weights if `update` is true.
 * Then re-evaluates all the searched posts scores.
 * @param {boolean} update
 */
function reEval(update = false) {
	if (update) updateModel();
	results.forEach((post, i) => {results[i].vals.probs = evalPost(post.tags)});
	filterPosts();
	showPosts();
}
/**
 * Modifies the post's category inside the `reacted` local data base and updates the `counts`
 * according to its tags.
 * 
 * Adds the post to the provided category if `inc` is true, removes it otherwise.
 * @param {Post} post
 * @param {number} cat
 */
function updatePost(post, cat) {
	if (post.cat == cat) return;
	// Remove from previous category
	if (post.cat != -1) {
		reacted[post.cat].splice(reacted[post.cat].indexOf(post.id));
		updateTags(post.tags, post.cat, -1);
	}
	// Add to new category
	reacted[cat].push(post.id);
	updateTags(post.tags, cat, +1);
	// Update post rating
	post.cat = cat;
}
/**
 * 
 * @param {Tag[]} tags
 * @param {number} cat
 * @param {number} val
 */
function updateTags(tags, cat, val) {
	counts.totals[cat] += val;
	for (const tag of tags) {
		if (counts.tags[tag] == undefined) counts.tags[tag] = new Array(NCats).fill(0);
		counts.tags[tag][cat] += val;
	}
}
/** @param {Iterable<Tag> | null} alteredTags */
function updateModel(alteredTags) {
	setState('Updating Model', 'model_training');
	
	if (alteredTags == null) alteredTags = Object.keys(counts.tags);
	
	// Update priors
	model.priors = initPriors(counts.totals);
	
	// Update react combining weights
	model.comb_w = initCombineW(model.priors);
	
	// Update modified tags weights
	for (const tag of alteredTags) model.tags[tag] = initWeights(model.priors, counts.tags[tag]);
	
	setState();
}
/**
 * @param {Cats<number>} totals
 * @returns {Cats<number>}
 */
function initPriors(totals) {
	let priors = totals.slice();
	
	for (const i in priors) priors[i] += 1; // Smoothing
	normalise(priors);
	
	return priors;
}
/**
 * Does all the necessary calculation of the tag weights for the model using statistical
 * methods.
 * @param {Cats<number>} priors
 * @param {Cats<number>} observed
 * @returns {Cats<number>}
 */
function initWeights(priors, observed) {
	const total = sum(observed);
	if (total <= 0) return new Array(NCats).fill(0);
	
	var probs = observed.slice();
	normalise(probs);
	
	// Uses the difference from the frequency to the priors to initialise the weights.
	for (const i in probs) probs[i] -= priors[i];
	
	// Lowers the weights if the multinomial distribution doesn't deviate enough from the priors,
	// but conservatively increases it if it is substantial.
	const gPval = gGOFT(priors, observed);
	const gConf = (1 - gPval) * Math.log(1 - Math.log(gPval)) / 2;
	for (const i in probs) probs[i] *= gConf;
	
	// Lowers the weight of individual categories if the difference from the prior is not
	// significant.
	for (const i in probs) probs[i] *= Math.pow(1 - bGOFT(priors[i], observed[i], total), 2);
	
	return probs;
}
const initCombineW_K = 1/Math.sqrt(2*Math.PI);
/**
 * Initialises the combining weights according to priors
 * @param {Cats<number>} priors
 * @returns {Cats<number>}
 */
function initCombineW(priors) {
	let comb_w = accumulate(priors);
	
	// Map categories frequencies to intervals in the normal distribution
	for (const i in comb_w) comb_w[i] = Math.SQRT2 * erfinv(2*comb_w[i] - 1);
	
	let b = -Infinity;
	for (const i in comb_w) {
		let a = b;
		b = comb_w[i];
		// Centre of Mass of the Normal Distribution between a and b
		comb_w[i] = initCombineW_K * (Math.exp(-a*a/2) - Math.exp(-b*b/2)) / priors[i];
	}
	
	return comb_w;
}
/**
 * Reads a JSON file provided by the user and replaces the local data with it.
 * @param {Blob} file
 */
function uploadData(file) {
	const reader = new FileReader();
	reader.onload = (event) => {
		const content = event.target.result;
		try {
			const data = JSON.parse(content);
			if (data.reacted != undefined) {
				reacted = data.reacted;
				localStorage.setItem('reacted', JSON.stringify(reacted));
			}
			if (data.counts != undefined) {
				counts = data.counts;
				localStorage.setItem('counts', JSON.stringify(counts));
			}
		} catch (error) {
			alert('File was not valid JSON!');
			console.error('Error parsing JSON file:\t', error);
		}
	}
	reader.readAsText(file);
	
	model = null;
	initData();
}
/**
 * Allows the user to download all the data collected and processed by this algorithm used for
 * its function.
 */
function downloadData() {
	const data = {
		version: 'YiffyBayes 2S',
		reacted: reacted,
		counts:  counts,
	};
	
	let download      = document.createElement('a');
	download.href     = 'data:application/json,' + encodeURI(JSON.stringify(data));
	download.target   = '_blank';
	download.download = 'YiffyBayes.json';
	download.click();
}
/**
 * Handles the logic behind reacting to a post on e621.
 * @argument {string} id
 */
async function e6React(id) {
	setState('Reacting to Post', 'thumbs_up_down');
	const post = filtered[currPost];
	
	if (id == 'fav') {
		await fetch(`https://e621.net/favorites.json`, {
			method: 'POST',
			headers: {
				Authorization: auth,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: `post_id=${post.id}`
		});
	} else {
		let vote = id == 'dislike' ? -1 : +1;
		await fetch(`https://e621.net/posts/${post.id}/votes.json`, {
			method: 'POST',
			headers: {
				Authorization: auth,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: `score=${vote}&no_unvote=true`
		}).then(res => res.json());
	}
	setState();
}
/**
 * @this {Element}
 */
function ratePost() {
	let post = filtered[currPost];
	let cat  = parseInt(this.value);
	updatePost(post, cat);
	setRateIndicator(cat);
}
/**
 * Replaces the state title and icon (Material Icons Outlined) on the top navigation bar.
 * @param {string} title
 * @param {string} icon
 */
function setState(title = 'idle', icon = 'mode_standby', disableSearch = false) {
	titleSt.title = title;
	iconSt.innerText = icon;
	if (disableSearch) {
		srcIcn.innerText = 'progress_activity';
		srcBtn.disabled  = true;
	} else if (title == 'idle') {
		srcIcn.innerText = 'search';
		srcBtn.disabled  = false;
	}
}
/**
 * Combines the posts score to a single number in a simple manner.
 * @param {Cats<number>} probs
 * @returns {number}
 */
function combine(probs) {
	let score = 0;
	for (const i in probs) score += model.comb_w[i] * probs[i];
	return score;
}
/**
 * @param {Post} post
 */
function wasSeen(post) {
	return post.cat != -1;
}
/**
 * Prints the selected post's tags, their counts, and weights on the console.
 */
function debugPost() {
	let table = [];
	filtered[currPost].tags.forEach(tag => table.push([
		tag,
		...counts.tags[tag] ?? new Array(NCats).fill(0),
		...(model.tags[tag] ?? new Array(NCats).fill(0))
	]));
	table.sort((a, b) => {a[0].localeCompare(b[0])});
	table.push(table.reduce((acc, v) => {
		for (let i = 1; i < v.length; i++) acc[i] += v[i]
		return acc
	}, acc = ['TOTALS', ...new Array(NCats*2).fill(0)]));
	console.table(table);
}
async function login() {
	let username = prompt('Insert your e621 username:').replaceAll(' ', '_');
	let APIKey   = prompt('Insert your e621 API Token\nYou can get it at https://e621.net/users/home -> Manage API Access (3rd option)');
	auth = `Basic ${btoa(`${username}:${APIKey}`)}`;
	localStorage.setItem('auth', auth);
	intBtns.style.display = 'flex';
	logBtn.title   = 'Logout';
	logBtn.onclick = logout;
	logBtn.firstChild.innerText = 'logout';
	
	if (confirm('Would you like to import your data from e621 (the posts you rated) to populate the model\'s data?\n\nYiffyBayes and e621 are not 1:1 compatible on their categories, so this may give inaccurate data to the model.\nThis proccess may take a while.')) importFromE621();
}
async function importFromE621() {
	setState('Importing Data from e621', 'cloud_sync', true);
	
	alert('Gathering new data from your account.\nThis may take a while... Wait before using YiffyBayes!\nAnother notification will apear when this proccess is done.');
	
	// Gather user's reacted posts
	const username = atob(auth.slice(6)).split(':')[0];
	const requests = {
		fav:     `fav:${username} status:any`,
		like:    'votedup:yiffybayes status:any',
		dislike: 'voteddown:yiffybayes status:any',
	};
	let seenTmp = {
		dislike: {},
		none:    {},
		like:    {},
		fav:     {},
		favlike: {},
	};
	results = [];
	for (const cat in requests) {
		await searchTags(requests[cat]);
		for (const post of results) seenTmp[cat][post.id] = post.tags;
		results = [];
	}
	
	// Get Favlikes from Fav & Like duplicates
	for (const postId in seenTmp.fav) {
		if (seenTmp.like[postId] != undefined) {
			seenTmp.favlike[postId] = seenTmp.fav[postId];
			delete seenTmp.fav[postId];
			delete seenTmp.like[postId];
		}
	}
	
	// Count the tags in each category
	counts = {
		totals: new Array(NCats).fill(0),
		tags: {},
	};
	for (const e6Cat in seenTmp) {
		for (let id in seenTmp[e6Cat]) {
			const cat = e6RatingConvTable[e6Cat];
			id = parseInt(id);
			reacted[cat].push(id);
			updatePost({
				id:   id,
				tags: seenTmp[e6Cat][id],
				cat:  getCat(id),
			}, cat);
		}
	}
	
	setState();
	alert('All done!');
}
