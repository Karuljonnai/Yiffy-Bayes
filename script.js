/** @typedef {number} ID */
/** @typedef {string} Tag */
/** @typedef {'favlike'|'fav'|'like'|'dislike'|'none'} Cat */
/** @typedef {[number, number, number, number, number]} CatArr */
/** @typedef {{[tag: Tag]: CatArr}} TagData */
/** @typedef {{[id: ID]: Tag[]}} PostData */
/**
 * @template {boolean|CatArr|Post[]|Tag[]|PostData} T
 * @typedef Cats
 * @prop {T} favlike
 * @prop {T} fav
 * @prop {T} like
 * @prop {T} dislike
 * @prop {T} none
 */
/**
 * Processed Post with all its relevant information.
 * @typedef Post
 * @prop {ID} id Post's e621 id.
 * @prop {Tag[]} tags List of e621 tags.
 * @prop {string} preview Link of post's small preview image file.
 * @prop {string} file Link of post's full image file.
 * @prop {string} type Post's type (image/video).
 * @prop {Cats<boolean>} reacts List of which reaction the user has made on this post.
 * @prop {{favs: number, score: number, probs: CatArr}} vals Post's relevant measurements (#favs, score, calculated score).
 */

/**
 * Basic Authentication
 * 
 * "Basic " followed by "\<Username\>:\<API Token\>" encoded in Base64.
 * @type {string}
 */
var auth = null
/**
 * Keeps track of all Tags the user has encountered, their reations to them, and their totals.
 * @type {{totals: CatArr, tags: TagData}}
 */
var counts = null
/**
 * Stores the post IDs that the user has previously seen in their respective categories.
 * @type {Cats<ID[]>}
 */
var reacted = null
/** @type {{priors: CatArr, tags: TagData}} */
var model = null
/** @type {Post[]} */
var results = []
/** @type {Post[]} */
var filtered = []

var currPost = -1
var currPage =  0
var endPage  =  0

var postsPerPage = 180

/**
 * Category to Index quick Look-Up-Table.
 * @type {Cats<number>}
 * */
const catIdx = {
	favlike: 0,
	fav:     1,
	like:    2,
	dislike: 3,
	none:    4,
}
/**
 * Look Up Table for e621's tag category numbers and their associated colours.
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
]

// DOM Elements
const grid     = document.querySelector('#img-grid')
const query    = document.querySelector('#query')
const autocomp = document.querySelector('#autocomplete')
const filter   = document.querySelector('#filter')
const sort     = document.querySelector('#sort')
const softm    = document.querySelector('#softmax')
const reverse  = document.querySelector('#reverse')
const back     = document.querySelector('#back')
const ori      = document.querySelector('#ori')
const fav      = document.querySelector('#fav')
const like     = document.querySelector('#like')
const dislike  = document.querySelector('#dislike')
const upload   = document.querySelector('#upload')
const titleSt  = document.querySelector('#state label')
const iconSt   = document.querySelector('#state label i')
const favs     = document.querySelector('#favs')
const score    = document.querySelector('#score')
const p_fl     = document.querySelector('#p_fl')
const p_fv     = document.querySelector('#p_fv')
const p_lk     = document.querySelector('#p_lk')
const p_dl     = document.querySelector('#p_dl')
const p_nn     = document.querySelector('#p_nn')
const comb     = document.querySelector('#comb')
const prefetch = document.querySelector('#prefetch')
const pageNums = document.querySelectorAll('.page-numbers')

upload.addEventListener('change', (event) => {
	const file = event.target.files[0]
	if (file) uploadData(file)
})
window.addEventListener('beforeunload', () => {
	storeData()
})
query.addEventListener('keyup', async (event) => {
	if (event.keyCode == 13) search() // ENTER
	else if (event.keyCode == 191) { // '?'
		const tag = /[\w\(\)]+(?=\?)/.exec(query.value)
		if (tag == null) return
		
		const tags = await searchTag(tag[0])
		autocomp.replaceChildren()
		tags.forEach(tag => {
			let li    = document.createElement('li')
			let name  = document.createElement('span')
			let count = document.createElement('i')
			
			li.onclick       = autocomplete
			name.innerText   = tag.name
			name.style.color = tagCatColour[tag.cat]
			count.innerText  = tag.count
			
			li.appendChild(name)
			li.appendChild(count)
			autocomp.appendChild(li)
		})
		
		autocomp.style.display = 'block'
	} else if (event.keyCode == 8) autocomp.style.display = 'none' // BACKSPACE
})

initData()

/**
 * If the user is already signed in, simply loads the necessary data from local storage.
 * Otherwise, prompts the user to input the necessary e621 account information, and then
 * must perform a lengthy search through e621 to gather the user's data: reacted posts, favs,
 * likes, and dislikes, but it wouldn't be possible to retrieve posts that the user has seen,
 * but didn't rate.
 * 
 * The user may skip that lengthy step, by choosing to upload their own precompiled data, either
 * by a previous download of their data through this application, or by their own preprocessing.
 */
async function initData() {
	// Login
	auth = localStorage.getItem('login')
	while (auth == null) {
		const login = prompt('Please enter your e621 username followed by a colon and then your API access key.\ne.g.: User123:APIKey0a1b2c3d\nYou can get it at https://e621.net/users/home -> Manage API Access')
		if (/^\w+:\w+$/.test(login)) {
			auth = `Basic ${btoa(login)}`
			localStorage.setItem('login', auth)
			break
		}
		alert('Your Login was not inputted correctly.\nYou need to login to use this application.\nPlease try again.')
	}
	
	// Get seen post IDs
	reacted = JSON.parse(localStorage.getItem('reacted'))
	if (reacted == null) {
		reacted = {
			favlike: [],
			fav:     [],
			like:    [],
			dislike: [],
			none:    [],
		}
	}
	
	// Search for Reacted Posts
	counts = JSON.parse(localStorage.getItem('counts'))
	if (counts == null) {
		if (!confirm('Data not found.\nGathering new data from your account.\nThis may take a while... Please wait until it\'s done. Continue?\n\nYou could cancel and upload your own preprocessed data.\n!ONLY CANCEL IF YOU KNOW WHAT YOU\'RE DOING!')) {
			alert('Please then upload your data appropriately.\n!DO NOT USE THIS APLICATION WHILE YOU HAVE NOT UPLOADED IT YET!')
			return
		}
		
		// Gather user's reacted posts
		const username = /^\w+(?=:)/.exec(atob(auth.slice(6)))[0]
		const requests = {
			fav:     `fav:${username} status:any`,
			like:    'votedup:yiffybayes status:any',
			dislike: 'voteddown:yiffybayes status:any'
		}
		/** @type {Cats<PostData>} */
		let seenTmp = {
			favlike: {},
			fav:     {},
			like:    {},
			dislike: {},
			none:    {},
		}
		results = []
		for (const cat in requests) {
			await searchTags(requests[cat])
			for (const post of results) seenTmp[cat][post.id] = post.tags
			results = []
		}
		
		// Get Favlikes from Fav & Like duplicates
		for (const favId in seenTmp.fav) {
			for (const likeId in seenTmp.like) {
				if (favId == likeId) {
					seenTmp.favlike[favId] = seenTmp.fav[favId]
					delete seenTmp.fav[favId]
					delete seenTmp.like[likeId]
					break
				}
			}
		}
		// Count the tags in each category
		counts = {
			totals: [0, 0, 0, 0, 0],
			tags: {},
		}
		for (const cat in seenTmp) {
			for (const id in seenTmp[cat]) {
				reacted[cat].push(id)
				counts.totals[catIdx[cat]]++
				for (const tag of seenTmp[cat][id]) {
					if (counts.tags[tag] == undefined) counts.tags[tag] = [0, 0, 0, 0, 0]
					counts.tags[tag][catIdx[cat]]++
				}
			}
		}
	}
	
	// Initialise an empty model
	model = {
		priors: [0, 0, 0, 0, 0],
		tags: {},
	}
}
/**
 * @this {HTMLElement}
 */
function autocomplete() {
	query.value = query.value.replace(/\w+\?/, this.firstChild.innerText + ' ')
	autocomp.style.display = 'none'
	query.focus()
}
/**
 * Saves the `counts` and `reacted` variables to the browser's local storage in JSON format.
 */
function storeData() {
	localStorage.setItem('counts',  JSON.stringify(counts))
	localStorage.setItem('reacted', JSON.stringify(reacted))
}
/**
 * The `search` function asynchronously searches for results based on user input and updates the
 * model accordingly.
 */
async function search() {
	currPost = -1
	currPage =  0
	pageNums.forEach(paginate => paginate.replaceChildren())
	grid.replaceChildren()
	results = []
	wait = searchTags(query.value)
	updateModel()
	await wait
	reEval(false)
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
	const postLimit = 320
	setState('fetching pages', 'wifi')
	outer: for (let cycle = 0; cycle < cycleLimit; cycle++) {
		let promises = []
		for (let page = cycle * pagesPerCycle +1; page <= (cycle + 1) * pagesPerCycle; page++) {
			promises.push(
				fetch(`https://e621.net/posts.json?limit=${postLimit}&page=${page}&tags=${tags}`, {
					headers: {Authorization: auth}
				}).then(res => res.json())
			)
		}
		
		const responses = await Promise.all(promises)
		for (const response of responses) {
			const posts = response.posts
			addPosts(posts)
			if (posts.length < postLimit) break outer
		}
	}
	setState()
}
/**
 * Searches for autocompletions of a tag in e621.
 * @param {string} tag
 * @returns {Promise<{name: string, count: number, cat: number}[]>}
 */
async function searchTag(tag) {
	const res = await fetch(`https://e621.net/tags.json?limit=64&search[order]=count&search[name_matches]=${tag}*`, {
		headers: {Authorization: auth}
	}).then(res => res.json())
	
	let tags = []
	res.forEach(tag => tags.push({
		name:  tag.name,
		count: tag.post_count,
		cat:   tag.category,
	}))
	
	return tags
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
			reacts:  getReacts(post.id),
			vals: {
				score: post.score.total,
				favs:  post.fav_count,
				probs: [0, 0, 0, 0, 0]
			}
		})
	}
}
/**
 * Displays a paginated list of posts on a grid, filtering out skipped
 * posts and marking seen posts.
 */
function showPosts() {
	grid.replaceChildren()
	const START = postsPerPage * currPage
	const END   = Math.min(START + postsPerPage, filtered.length)
	for (let i = START; i < END; i++) {
		const post = filtered[i]
		
		const article = document.createElement('article')
		const a       = document.createElement('a')
		const div     = document.createElement('div')
		const img     = document.createElement('img')
		
		if (wasSeen(post)) article.classList.add('seen')
		
		article.classList.add('img-res')
		a.id = i
		a.href = '#viewing-page'
		a.onclick = view
		img.src = post.preview
		div.innerText = getVal(post)
		
		a.appendChild(img)
		article.appendChild(a)
		article.appendChild(div)
		grid.appendChild(article)
	}
	
	paginate()
}
/**
 * Sorts and filters searched posts based on the user's choice.
*/
function filterPosts() {
	sortPosts()
	
	filtered = results.filter(post => !shouldSkipPost(post))
}
/**
 * Populates the page buttons.
 */
function paginate() {
	pageNums[0].replaceChildren();
	pageNums[1].replaceChildren();
	endPage = Math.ceil(filtered.length / postsPerPage) -1
	for (let i = 0; i <= endPage; i++) {
		const btn0 = document.createElement('button')
		const btn1 = document.createElement('button')
		
		btn0.innerText = i
		btn0.onclick = gotoPage
		
		btn1.innerText = i
		btn1.onclick = gotoPage
		
		pageNums[0].appendChild(btn0)
		pageNums[1].appendChild(btn1)
	}
}
/**
 * Decides if the post should be skipped based on the filter selected by the user.
 * @param {Post} post
 * @returns {boolean}
 */
function shouldSkipPost(post) {
	const val = filter.value
	if (val == 'all') return false
	// if (val == 'seen' || val == 'unseen') // Always true for now
	return (val == 'unseen') == wasSeen(post) // XOR Hack
}
/**
 * Searches through the local data to see which reation the user had with that post.
 * @param {ID} id
 * @returns {Cats<boolean>}
 */
function getReacts(id) {
	let reacts = {}
	
	for (const cat in reacted) reacts[cat] = reacted[cat].includes(id)
	
	return reacts
}
/**
 * Sorts the search's resulted posts.
 */
function sortPosts() {
	results.sort((a, b) => {
		return getVal(b) - getVal(a)
	})
	if (reverse.checked) results.reverse()
}
/**
 * Returns the post's value relevant to the sorting requierement.
 * @param {Post} post
 * @returns {number}
 */
function getVal(post) {
	const val = sort.value
	const idx = sort.selectedIndex
	if (idx == 0) return combine(post.vals.probs)
	if (idx > 5) {
		if (idx == 8) return post.id
		return post.vals[val]
	}
	return post.vals.probs[val]
}
/** @this {HTMLElement} */
function view() {
	currPost = parseInt(this.id)
	showBigPost()
}

function nextPost() {
	if (currPost >= results.length -1) return
	currPost++
	showBigPost()
}

function prevPost() {
	if (currPost <= 1) return
	currPost--
	showBigPost()
}

function nextPage() {
	if (currPage >= endPage) return
	currPage++
	showPosts()
}

function prevPage() {
	if (currPage <= 0) return
	currPage--
	showPosts()
}
/** @this {HTMLElement} */
function gotoPage() {
	currPage = parseInt(this.innerText)
	showPosts()
	return false
}
/**
 * Loads the current selected post to the big viewer.
 */
function showBigPost() {
	let post = filtered[currPost]
	if (!wasSeen(post)) updatePost(post, 'none', true)
	
	back.href = `#${currPost}`
	ori.href  = `https://e621.net/posts/${post.id}`
	document.getElementById(currPost).parentElement.classList.add('seen')
	
	fav.className     = (post.reacts.favlike || post.reacts.fav)  ? 'voted' : ''
	like.className    = (post.reacts.favlike || post.reacts.like) ? 'voted' : ''
	dislike.className =  post.reacts.dislike ? 'voted' : ''
	
	favs.innerText  = post.vals.favs
	score.innerText = post.vals.score
	p_fl.innerText  = post.vals.probs[0]
	p_fv.innerText  = post.vals.probs[1]
	p_lk.innerText  = post.vals.probs[2]
	p_dl.innerText  = post.vals.probs[3]
	p_nn.innerText  = post.vals.probs[4]
	comb.innerText  = combine(post.vals.probs)
	
	const bigMedia = document.createElement(post.type)
	bigMedia.src = post.file
	bigMedia.id  = 'big-view'
	bigMedia.alt = 'Nothing here...'
	bigMedia.controls = true
	bigMedia.loop     = true
	document.querySelector('#big-view').replaceWith(bigMedia)
	
	// Prefetch next post
	if (currPost < filtered.length -1) prefetch.src = filtered[currPost +1].file
}
/**
 * Evaluated the post using a custom Content-Based Filtering Recommender System, inspired by
 * the Naive Bayes Classifier.
 * @param {Tag[]} tags
 * @returns {CatArr}
 */
function evalPost(tags) {
	// Difference Naive Bayes
	/** @type {CatArr} */
	let probs = model.priors.slice()
	
	for (const tag of tags) {
		const update = model.tags[tag]
		if (update == undefined) continue
		for (const i in update) probs[i] += update[i]
	}
	
	if (softm.checked) softmax(probs)
	
	return probs
}
/** @param {CatArr} arr */
function softmax(arr) {
	const max = Math.max(...arr)
	for (const i in arr) arr[i] = Math.exp(arr[i] - max)
	normalise(arr)
}
/**
 * @param {Iterable<number>} itr
 * @returns {number}
 */
function sum(itr) {
	let acc = 0
	for (const v of itr) acc += v
	return acc
}
/** @param {CatArr} arr */
function normalise(arr) {
	const total = sum(arr)
	for (const i in arr) arr[i] /= total
}
/**
 * @param {CatArr} priors
 * @param {CatArr} observed
 * @returns {number}
 */
function gGOFT(priors, observed) {
	let expected = priors.slice()
	const total = sum(observed)
	for (const i in priors) expected[i] *= total
	
	let g = 0
	for (const i in priors) if (observed[i] > 0) g += observed[i] * Math.log(observed[i] / expected[i])
	
	return chi2dist4(williamCorr(2*g, total, 5))
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
	var   p = prior
	const k = observed
	const n = total
	
	/** @type {number} */
	let pval = 0
	if (total <= 512) { // Semi Exact Test
		if (2*observed > total) p = 1-p
		const kp = binProb(p, k, n)
		pval = kp
		for (let i = 0; i < k; i++) pval += binProb(p, i, n)
		for (let i = n; i > k; i--) {
			const ip = binProb(p, i, n)
			if (ip > kp) break
			pval += ip
		}
	} else { // Approximation
		const e = p*n
		const c = n-k
		if (k > 0) pval += k * Math.log(k / e)
		if (c > 0) pval += c * Math.log(c / (n - e))
		pval = chi2dist1(williamCorr(2*pval, n, 2))
	}
	
	return pval
}
/**
 * @param {number} p
 * @param {number} i
 * @param {number} n
 * @returns {number}
 */
function binProb(p, i, n) {
	if (p == 0 || p == 1) return 0
	return Math.exp(lnChoose(n,i) + i*Math.log(p) + (n-i)*Math.log(1-p))
}
/**
 * Does all the necessary calculation of the tag weights for the model using statistical
 * methods.
 * @param {CatArr} priors
 * @param {CatArr} observed
 * @returns {CatArr}
 */
function initProbs(priors, observed) {
	const total = sum(observed)
	if (total <= 0) return [0, 0, 0, 0, 0]
	
	var probs = observed.slice()
	normalise(probs)
	
	// Uses the difference from the frequency to the priors to initialise the weights.
	for (const i in probs) probs[i] -= priors[i]
	
	// Lowers the weights if the multinomial distribution doesn't deviate enough from the priors,
	// but conservatively increases it if it is substantial.
	const gPval = gGOFT(priors, observed)
	const gConf = (1 - gPval) * Math.log(1 - Math.log(gPval))
	for (const i in probs) probs[i] *= gConf
	
	// Lowers the weight of individual categories if the difference from the prior is not
	// significant.
	for (const i in probs) probs[i] *= Math.pow(1 - bGOFT(priors[i], observed[i], total), 2)
	
	return probs
}
/**
 * Approximation of the tail distribution of chi squared for 1 degree of freedom.
 * @param {number} chi2
 * @returns {number}
 */
function chi2dist1(chi2) {
	return 1 - erf(Math.sqrt(chi2 / 2))
}
/**
 * Exact tail distribution of chi squared for 4 degree of freedom.
 * @param {number} chi2
 * @returns {number}
 */
function chi2dist4(chi2) {
	return 0.5 * (chi2 + 2) * Math.exp(-0.5 * chi2)
}
/**
 * William's Correction
 * @param {number} chi2
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function williamCorr(chi2, n, k) {
	const snv = 6 * n * (k - 1)
	const q = snv / (snv + k*k -1)
	return chi2 * q
}
const K = Math.log(2*Math.PI)/2
/**
 * Approximation of `ln(x!)`
 * @param {number} x
 * @returns {number}
 */
function lnfac(x) {
	if (x <= 1.097952) return x*(x -1) / (2*Math.log(x + 2.325))
	return K + Math.log(x)/2 + x*(Math.log(x + 1/(12*x)) -1)
}
/**
 * Approximation of the Error Function
 * @param {number} x
 * @returns {number}
 */
function erf(x) {
	return Math.tanh(1.1293544753137241*x + 0.10026381310736299*x*x*x)
}
/**
 * `n choose k`
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function choose(n, k) {
	if (2*k < n) k = n - k
	
	let c = 1
	const LIM = n - k
	for(let i = 1; i <= LIM; i++) c *= k / i + 1
	
	return c
}
/**
 * Approximation of `ln(n choose k)`
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function lnChoose(n, k) {
	return lnfac(n) - (lnfac(k) + lnfac(n - k))
}
/**
 * Flattens the tags from the raw e621 post format.
 * @param {{[category: string]: Tag[]}} _tags
 * @returns {Tag[]}
 */
function extractTags(_tags) {
	let tags = []
	delete _tags.invalid
	for (const cat in _tags) tags.push(..._tags[cat])
	return tags
}
/**
 * Deletes all user data.
 */
function logout() {
	if (!confirm('Are you sure you want to logout?\nYou will lose all your local data.')) return
	localStorage.removeItem('login')
	localStorage.removeItem('counts')
	localStorage.removeItem('reacts')
	model = null
	initData()
}
/**
 * Updates the model's weights if `update` is true.
 * Then re-evaluates all the searched posts scores.
 * @param {boolean} update
 */
function reEval(update = false) {
	if (update) updateModel()
	results.forEach((post, i) => {results[i].vals.probs = evalPost(post.tags)})
	filterPosts()
	showPosts()
}
/**
 * Modifies the post's category inside the `reacted` local data base and updates the `counts`
 * according to its tags.
 * 
 * Adds the post to the provided category if `inc` is true, removes it otherwise.
 * @param {Post} post
 * @param {Cat} cat
 * @param {boolean} inc
 */
function updatePost(post, cat, inc) {
	const idx = catIdx[cat]
	const val = inc ? +1 : -1
	
	if (inc) reacted[cat].push(post.id)
	else reacted[cat].splice(reacted[cat].indexOf(post.id), 1)
	
	post.reacts[cat] = inc
	counts.totals[idx] += val
	for (const tag of post.tags) {
		if (!counts.tags.hasOwnProperty(tag)) counts.tags[tag] = [0, 0, 0, 0, 0]
		counts.tags[tag][idx] += val
	}
}
/** @param {Iterable<Tag> | null} alteredTags */
function updateModel(alteredTags) {
	if (alteredTags == null) alteredTags = Object.keys(counts.tags)
	
	// Update priors
	model.priors = counts.totals.slice()
	let priors = model.priors // Alias
	for (const i in priors) priors[i] += 1 // Smoothing
	normalise(priors)
	
	// Update modified tags
	for (const tag of alteredTags) {
		const observed  = counts.tags[tag] // Alias
		model.tags[tag] = initProbs(priors, observed)
	}
}
/**
 * Reads a JSON file provided by the user and replaces the local data with it.
 * @param {Blob} file
 */
function uploadData(file) {
	const reader = new FileReader()
	reader.onload = (event) => {
		const content = event.target.result
		try {
			const data = JSON.parse(content)
			if (data.reacted != undefined) {
				reacted = data.reacted
				localStorage.setItem('reacted', JSON.stringify(reacted))
			}
			if (data.counts != undefined) {
				counts = data.counts
				localStorage.setItem('counts', JSON.stringify(counts))
			}
		} catch (error) {
			alert('File was not valid JSON!')
			console.error('Error parsing JSON file:\t', error)
		}
	}
	reader.readAsText(file)
	
	model = null
	initData()
}
/**
 * Allows the user to download all the data collected and processed by this algorithm used for
 * its function.
 */
function downloadData() {
	const data = {
		reacted: reacted,
		counts:  counts,
	}
	
	let download      = document.createElement('a')
	download.href     = 'data:application/json,' + encodeURI(JSON.stringify(data))
	download.target   = '_blank'
	download.download = 'e6data.json'
	download.click()
}
/**
 * Handles the logic behind reacting to a post, from API to updating the counts accordingly.
 * @param {Event} event
 */
async function reactToPost(event) {
	const post = filtered[currPost]
	const btn = event.currentTarget
	const unvote = btn.className == 'voted'
	btn.className = unvote ? '' : 'voted'
	
	if (btn.id == 'fav') {
		if (unvote) { // Remove Fav
			await fetch(`https://e621.net/favorites/${post.id}.json`, {
				method: 'DELETE',
				headers: {Authorization: auth},
			})
			if (post.reacts.favlike) {
				updatePost(post, 'favlike', false)
				updatePost(post, 'like', true)
			} else {
				updatePost(post, 'fav', false)
				if (!post.reacts.dislike) updatePost(post, 'none', true)
			}
		} else { // Add Fav
			const response = await fetch(`https://e621.net/favorites.json`, {
				method: 'POST',
				headers: {
					Authorization: auth,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: `post_id=${post.id}`
			})
			if (!response.ok) console.error(response)
			if (post.reacts.like) {
				updatePost(post, 'favlike', true)
				updatePost(post, 'like', false)
			} else {
				updatePost(post, 'fav', true)
				if (post.reacts.none) updatePost(post, 'none', false)
			}
		}
	} else {
		/** @type {1|-1} */
		let vote
		if (unvote) {
			if (btn.id == 'dislike') {
				vote = -1
				updatePost(post, 'dislike', false)
			} else {
				vote = +1
				if (post.reacts.favlike) {
					updatePost(post, 'favlike', false)
					updatePost(post, 'fav', true)
				} else updatePost(post, 'like', false)
			}
			if (!post.reacts.fav) updatePost(post, 'none', true)
		} else {
			if (btn.id == 'dislike') {
				vote = -1
				like.className = ''
				updatePost(post, 'dislike', true)
			} else {
				vote = +1
				dislike.className = ''
				if (post.reacts.fav) {
					updatePost(post, 'favlike', true)
					updatePost(post, 'fav', false)
				} else updatePost(post, 'like', true)
			}
			if (post.reacts.none) updatePost(post, 'none', false)
		}
		
		const response = await fetch(`https://e621.net/posts/${post.id}/votes.json`, {
			method: 'POST',
			headers: {
				Authorization: auth,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: `score=${vote}&no_unvote=false`
		}).then(res => res.json())
		
		/** @type {0|1|-1} */
		const expectedScore = unvote ? 0 : vote
		/** @type {0|1|-1} */
		const score = response.our_score
		// DeSync Error Recovery
		if (expectedScore != score) {
			btn.className = unvote ? 'voted' : ''
			if (unvote) {
				if (score == -1) updatePost(post, 'dislike', true)
				else {
					if (post.reacts.fav) updatePost(post, 'favlike', true)
					else updatePost(post, 'like', true)
				}
				if (post.reacts.fav) updatePost(post, 'fav', false)
				else updatePost(post, 'none', false)
			} else {
				if (expectedScore == -1) {
					updatePost(post, 'dislike', false)
					if (!post.reacts.fav) updatePost(post, 'none', true)
				} else {
					if (post.reacts.favlike) {
						updatePost(post, 'favlike', false)
						updatePost(post, 'fav', true)
					} else {
						updatePost(post, 'like', false)
						updatePost(post, 'none', true)
					}
				}
			}
			alert('A Desync Error was encountered and recovered from, but your reaction change was not registered for that post.')
			console.warn('Desync Error Recovered:\n' + post)
		}
	}
}
/**
 * Replaces the state title and icon (Material Icons Outlined) on the top navigation bar.
 * @param {string} title
 * @param {string} icon
 */
function setState(title = 'idle', icon = 'mode_standby') {
	titleSt.title = title
	iconSt.innerText = icon
}
/**
 * Combines the posts score to a single number in a simple manner.
 * @param {CatArr} probs
 * @returns {number}
 */
function combine(probs) {
	return 3*probs[0] + 2*probs[1] + probs[2] - 5*probs[3]
}
/**
 * Checks if the post is already in the local data base of seen posts.
 * @param {Post} post
 */
function wasSeen(post) {
	for (const cat in post.reacts) if (post.reacts[cat]) return true
	return false
}
/**
 * Prints the selected post's tags and their counts and weights on the console.
 */
function debugPost() {
	let table = []
	filtered[currPost].tags.forEach(tag => table.push([
		tag,
		...counts.tags[tag] ?? [0, 0, 0, 0, 0],
		...(model.tags[tag] ?? [0, 0, 0, 0, 0])
	]))
	table.sort((a, b) => {a[0].localeCompare(b[0])})
	table.push(table.reduce((acc, v) => {
		for (let i = 1; i < v.length; i++) acc[i] += v[i]
		return acc
	}, acc = ['TOTALS', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
	console.table(table)
}
// FUCK YOU, LETÍCIA, MY GOOD FRIEND ^^
