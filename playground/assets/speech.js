﻿// Code that generates math speech from MathML. Create DOM for MathML, extract
// symbols from DOM inserting nonmath symbols for connecting words, and convert
// the symbols to speech using symbolSpeech(). The default speech language is
// English. To localize the speech in another languages, translate the strings
// in symbolSpeechString, functions, mathstyles, and ordinals. The speech
// generation can be guided by MathML intent attributes, which may allow one
// to change the speech ordering from English.

const symbolSpeechStrings = {
	// This list includes speech strings for math symbols. In addition, it has
	// some nonmath symbols used to represent connecting words like 'from' and
	// 'to'. It is the principal list that needs to be localized. See also
	// ordinals and functions.
	' ': 'space',
	'!': 'factorial',
	'#': ', equation',
	'&': 'and',
	'(': 'open',
	')': 'close',
	',': 'comma',
	'/': 'over',
	'<': 'less than',
	'>': 'greater than',
	'@': ', row',
	'A': 'eigh',							// Letter 'A', which TTS may pronounce incorrectly
	'[': 'open bracket',
	']': 'close bracket',
	'^': 'soup',
	'_': 'sub',
	'{': 'open brace',
	'|': 'vertical bar',
	'}': 'close brace',
	' ': 'space',							// 00A0
	'¦': ', atop,',							// 00A6
	'¬': 'not',								// 00AC
	'¯': 'overbar',							// 00AF
	'°': 'degrees',							// 00B0
	'±': 'plus or minus',					// 00B1
	'²': 'squared',							// 00B2
	'³': 'cubed',							// 00B3
	'¶': ', end',							// 00B6, e.g., '¶ ⍁' for 'end fraction'
	'¼': 'one fourth',						// 00BC
	'½': 'one half',						// 00BD
	'×': 'times',							// 00D7
	'·': 'dot',								// 00B7
	'÷': 'divided by',						// 00F7
	'ď': 'partial-derivative',				// 010F
	'đ': 'derivative',						// 0111
	'ı': 'dotless i',						// 0131
	'ŵ': 'with respect to',					// 0175
	'ȷ': 'dotless j',						// 0237
	'\u0300': 'grave',
	'\u0301': 'acute',
	'\u0302': 'hat',
	'\u0303': 'tilde',
	'\u0305': 'bar',
	'\u0307': 'dot',
	'\u0308': 'double dot',
	'Γ': 'Gamma',
	'Δ': 'Delta',
	'Θ': 'Theta',
	'Λ': 'Lambda',
	'Π': 'Pi',
	'Σ': 'Sigma',
	'Φ': 'Phi',
	'Ψ': 'Psi',
	'Ω': 'Omega',
	'α': 'alpha',							// 03B1
	'β': 'beta',
	'γ': 'gamma',
	'δ': 'delta',
	'ε': 'script epsilon',
	'ζ': 'zeta',
	'η': 'eta',
	'θ': 'theta',
	'ι': 'iota',
	'κ': 'kappa',
	'λ': 'lambda',
	'μ': 'mu',
	'ν': 'nu',
	'ξ': 'xkai',
	'ο': 'omicron',
	'π': 'pi',
	'ρ': 'rho',
	'ς': 'final sigma',
	'σ': 'sigma',
	'τ': 'tau',
	'υ': 'upsilon',
	'φ': 'script phi',
	'χ': 'chi',
	'ψ': 'psi',
	'ω': 'omega',
	'ϑ': 'script theta',
	'ϕ': 'phi',
	'Ϝ': 'cap digamma',
	'ϝ': 'digamma',
	'ϵ': 'epsilon',
	'\u200B': ',',							// ZWSP
	'‖': 'double vertical line',				// 2016
	'…': 'dot dot dot',						// 2026
	'′': 'prime',							// 2032
	'⁄': 'slash',							// 2044
	'⁅': ', equation',						// 2045
	'⁆': ',',								// 2046
	'⁐': 'with',							// 2050
	'\u2061': ' ',							// FunctionApply
	'₁': 'tenths',							// 2081
	'₂': 'halves',							// 2082
	'₃': 'thirds',							// 2083
	'₄': 'fourths',							// 2084
	'₅': 'fifths',							// 2085
	'₆': 'sixths',							// 2086
	'₇': 'sevenths',						// 2087
	'₈': 'eighths',							// 2088
	'₉': 'ninths',							// 2089
	'ℏ': 'h bar',							// 210F
	'ⅅ': 'differential D',					// 2145
	'ⅆ': 'differential d',					// 2146
	'ⅇ': 'e',								// 2147
	'ⅈ': 'i',								// 2148
	'ⅉ': 'j',								// 2149
	'⅐': 'one seventh',						// 2150
	'⅑': 'one ninth',						// 2151
	'⅒': 'one tenth',						// 2152
	'⅓': 'one third',						// 2153
	'⅕': 'one fifth',						// 2155
	'⅙': 'one sixth',						// 2159
	'⅛': 'one eighth',						// 215B
	'←': 'left arrow',						// 2190
	'↑': 'up arrow',						// 2191
	'→': 'right arrow',						// 2192
	'↓': 'down arrow',						// 2193
	'↔': 'left right arrow',				// 2194
	'⇒': 'implies',							// 21D2
	'⇔': 'if and only if',					// 21D4
	'⇳': 'height phantom',					// 21F3
	'∀': 'for all',							// 2200 (All chars in 2200 block)
	'∁': 'complement',
	'∂': 'partial',
	'∃': 'there exists',
	'∄': 'there doesn\'t exist',
	'∅': 'empty set',
	'∆': 'increment',
	'∇': 'del',
	'∈': 'element of',
	'∉': 'not element of',
	'∊': 'small element of',
	'∋': 'contains as member',
	'∌': 'doesn\'t contain as member',
	'∍': 'small contains as member',
	'∎': 'q e d',
	'∏': 'product',
	'∐': 'coproduct',						// 2210
	'∑': 'sum',
	'−': 'minus',
	'∓': 'minus or plus',
	'∔': 'dot plus',
	'∕': 'linear divide',
	'∖': 'set minus',
	'∗': 'asterisk operator',
	'∘': 'ring operator',
	'∙': 'bullet',
	'√': 'square root',
	'∛': 'cube root',
	'∜': 'fourth root',
	'∝': 'proportional to',
	'∞': 'infinity',
	'∟': 'right angle',
	'∠': 'angle',							// 2220
	'∡': 'measured angle',
	'∢': 'spherical angle',
	'∣': 'divides',
	'∤': 'doesn\'t divide',
	'∥': 'parallel to',
	'∦': 'not parallel to',
	'∧': 'logical andd',
	'∨': 'logical or',
	'∩': 'intersection',
	'∪': 'union',
	'∫': 'integral',
	'∬': 'double integral',
	'∭': 'triple integral',					// 2230
	'∮': 'contour integral',
	'∯': 'surface integral',
	'∰': 'volume integral',
	'∱': 'clockwise integral',
	'∲': 'clockwise contour integral',
	'∳': 'anticlockwise contour integral',
	'∴': 'therefore',
	'∵': 'because',
	'∶': 'ratio',
	'∷': 'proportion',
	'∸': 'dot minus',
	'∹': 'excess',
	'∺': 'geometric proportion',
	'∻': 'homothetic',
	'∼': 'tilde operator',
	'∽': 'reverse tilde operator',
	'∾': 'inverted lazy s',
	'∿': '\'sine\' wave',
	'≀': 'wreath product',					// 2240
	'≁': 'not tilde',
	'≂': 'minus tilde',
	'≃': 'asymptotically equal to',
	'≄': 'not asymptotically equal to',
	'≅': 'approximately equal to',
	'≆': 'approximately but not equal to',
	'≇': 'neither approximately nor equal to',
	'≈': 'almost equal to',
	'≉': 'not almost equal to',
	'≊': 'almost equal or equal to',
	'≋': 'triple tilde',
	'≌': 'all equal to',
	'≍': 'equivalent to',
	'≎': 'geometrically equivalent to',
	'≏': 'difference between',
	'≐': 'approaches the limit',				// 2250
	'≑': 'geometrically equal to',
	'≒': 'nearly equals',
	'≓': 'image of or approximately equal to',
	'≔': 'colon equals',
	'≕': 'equals colon,',
	'≖': 'ring in equal to',
	'≗': 'ring equal to',
	'≘': 'corresponds to',
	'≙': 'estimates',
	'≚': 'equiangular to',
	'≛': 'star equals',
	'≜': 'delta equals',
	'≝': 'equals by definition',
	'≞': 'measured by',
	'≟': 'questioned equals',
	'≠': 'not equal',						// 2260
	'≡': 'identical to',
	'≢': 'not identical to',
	'≣': 'strictly equivalent to',
	'≤': 'less than or equal to',
	'≥': 'greater than or equal to',
	'≦': 'less than over equal to',
	'≧': 'greater than over equal to',
	'≨': 'less than but not equal to',
	'≩': 'greater than but not equal to',
	'≪': 'much less than',
	'≫': 'much greater than',
	'≬': 'between',
	'≭': 'not equivalent to',
	'≮': 'not less than',
	'≯': 'not greater than',
	'≰': 'not less than or equal',			// 2270
	'≱': 'not greater than or equal',
	'≲': 'less than or equivalent',
	'≳': 'greater than or equivalent to',
	'≴': 'neither less than nor equivalent to',
	'≵': 'neither greater than nor equivalent to',
	'≶': 'less than or greater than',
	'≷': 'greater than or less than',
	'≸': 'neither less than nor greater than',
	'≹': 'neither greater than nor less than',
	'≺': 'precedes',
	'≻': 'succeeds',
	'≼': 'precedes or equals',
	'≽': 'succeeds or equals',
	'≾': 'precedes or is equivalent to',
	'≿': 'succeeds or is equivalent to',
	'⊀': 'doesn\'t precede',					// 2280
	'⊁': 'doesn\'t succeed',
	'⊂': 'subset of',
	'⊃': 'superset of',
	'⊄': 'not subset of',
	'⊅': 'not superset of',
	'⊆': 'subset or equals',
	'⊇': 'superset or equals',
	'⊈': 'neither a subset nor equal to',
	'⊉': 'neither a superset nor equal to',
	'⊊': 'subset of with not equal to',
	'⊋': 'superset of with not equal to',
	'⊌': 'multiset',
	'⊍': 'multiset times',
	'⊎': 'multiset union',
	'⊏': 'square image of',
	'⊐': 'square original of',				// 2290
	'⊑': 'square image of or equal to',
	'⊒': 'square original of or equal to',
	'⊓': 'square cap',
	'⊔': 'square cup',
	'⊕': 'circled plus',
	'⊖': 'circled minus',
	'⊗': 'circled times',
	'⊘': 'circled divide',
	'⊙': 'circled dot',
	'⊚': 'circled ring',
	'⊛': 'circled asterisk',
	'⊜': 'circled equals',
	'⊝': 'circled dash',
	'⊞': 'squared plus',
	'⊟': 'squared minus',
	'⊠': 'squared times',					// 22A0
	'⊡': 'squared dot',
	'⊢': 'right tack',
	'⊣': 'left tack',
	'⊤': 'down tack',
	'⊥': 'up tack',
	'⊦': 'reduces to',
	'⊧': 'models',
	'⊨': 'results in',
	'⊩': 'forces',
	'⊪': 'triple vertical bar right turnstile',
	'⊫': 'double vertical bar double right turnstile',
	'⊬': 'does not prove',
	'⊭': 'doesn\'t result in',
	'⊮': 'doesn\'t force',
	'⊯': 'negated double vertical bar double right turnstile',
	'⊰': 'precedes under relation',			// 22B0
	'⊱': 'succeeds under relation',
	'⊲': 'is a normal subgroup of',
	'⊳': 'contains as normal subgroup',
	'⊴': 'is a normal subgroup of or equals',
	'⊵': 'contains as normal subgroup of or equals',
	'⊶': 'original of',
	'⊷': 'image of',
	'⊸': 'multimap',
	'⊹': 'hermitian conjugate matrix',
	'⊺': 'intercalate',
	'⊻': 'xor',
	'⊼': 'nand',
	'⊽': 'nor',
	'⊾': 'right angle with arc',
	'⊿': 'right triangle',
	'⋀': 'n-ary logical andd',				// 22C0
	'⋁': 'n-ary logical or',
	'⋂': 'n-ary intersection',
	'⋃': 'n-ary union',
	'⋄': 'diamond',
	'⋅': 'dot',
	'⋆': 'star',
	'⋇': 'division times',
	'⋈': 'bowtie',
	'⋉': 'left normal factor semidirect product',
	'⋊': 'right normal factor semidirect product',
	'⋋': 'left semidirect product',
	'⋌': 'right semidirect product',
	'⋍': 'reverse tilde equals',
	'⋎': 'curly logical or',
	'⋏': 'curly logical andd',
	'⋐': 'double subset',					// 22D0
	'⋑': 'double superset',
	'⋒': 'double intersection',
	'⋓': 'double union',
	'⋔': 'pitchfork',
	'⋕': 'equal and parallel to',
	'⋖': 'dotted less than',
	'⋗': 'dotted greater than',
	'⋘': 'very much less than',
	'⋙': 'very much greater than',
	'⋚': 'less than equals or greater than',
	'⋛': 'greater than equals or less than',
	'⋜': 'equals or less than',
	'⋝': 'equals or greater than',
	'⋞': 'equals or precedes',
	'⋟': 'equals or succeeds',
	'⋠': 'doesn\'t precede or equal',		// 22E0
	'⋡': 'doesn\'t succeed or equal',
	'⋢': 'not square image of or equal to',
	'⋣': 'not square original of or equal to',
	'⋤': 'square image of or not equal to',
	'⋥': 'square original of or not equal to',
	'⋦': 'less than but not equivalent to',
	'⋧': 'greater than but not equivalent to',
	'⋨': 'precedes but not equivalent to',
	'⋩': 'succeeds but not equivalent to',
	'⋪': 'not normal subgroup of',
	'⋫': 'does not contain as normal subgroup',
	'⋬': 'not normal subgroup of or equal to',
	'⋭': 'does not contain as normal subgroup or equal',
	'⋮': 'vertical ellipsis',
	'⋯': 'dot dot dot',
	'⋰': 'up right diagonal ellipsis',		// 22F0
	'⋱': 'down right diagonal ellipsis',
	'⋲': 'element of with long horizontal stroke',
	'⋳': 'element of with vertical bar at stroke end ',
	'⋴': 'small element of with vertical bar at stroke end',
	'⋵': 'dotted element of ',
	'⋶': 'overbar element of',
	'⋷': 'small overbar element of',
	'⋸': 'underbar element of',
	'⋹': 'double stroke element of',
	'⋺': 'long-stroke contains',
	'⋻': 'contains with vertical bar at stroke end',
	'⋼': 'small contains with vertical bar at stroke end',
	'⋽': 'overbar contains',
	'⋾': 'small overbar contains',
	'⋿': 'z notation bag membership',		// 22FF

	'⌈': 'open ceiling',						// 2308
	'⌉': 'close ceiling',					// 2309
	'⌊': 'open floor',						// 230A
	'⌋': 'close floor',						// 230B
	'⍁': 'fraction',						// 2341
	'⍆': ', case',							// 2346
	"⍈": ', equation',						// 2348
	'⍨': 'as',								// 2368
	'⎴': 'over bracket',					// 23B4
	'⎵': 'under bracket',					// 23B5
	'⏉': 'transpose',						// 23C9
	'⏒': 'closed-open interval',				// 23D2
	'⏓': 'open-closed interval',				// 23D3
	'⏔': 'closed interval',					// 23D4
	'⏕': 'open interval',					// 23D5
	'⏜': 'over paren',						// 23DC
	'⏝': 'under paren',						// 23DD
	'⏞': 'over brace',						// 23DE
	'⏟': 'under brace',						// 23DF
	'⏠': 'over shell',						// 23E0
	'⏡': 'under shell',						// 23E1
	'⏳': ',',								// 23F3
	'⒜': 'absolute value',					// 249C
	'⒞': 'choose',							// 249E
	'⒨': 'parenthesized matrix',			// 24A8
	'⒩': 'normed matrix',					// 24A9
	'⒭': 'root',							// 24AD
	'⒱': 'determinant',						// 24B1
	'Ⓒ': 'cases',							// 24B8
	'Ⓢ': 'curly braced matrix',				// 24C8
	'ⓒ': 'cardinality',						// 24D2
	'ⓢ': 'bracketed matrix',				// 24E2
	'ⓣ': 'the',								// 24E3
	'─': 'line on',							// 2500 (for partial box lead-in)
	'━': 'line',							// 2501 (for matrix array)
	'│': 'vertical bar',					// 2502
	'┠': 'left',							// 2520 (for box 'left')
	'┤': '',								// 2524
	'┨': 'right',							// 2528 (for box 'right')
	'┬': 'below',							// 252C
	'┯': 'top',								// 252F (for box 'top')
	'┴': 'above',							// 2534
	'┷': 'bottom',							// 2537 (for box 'bottom')
	'═': 'lines',							// 2550 (for matrix array)
	'▁': 'underbar',						// 2581
	'█': 'equation array',					// 2588
	'▒': 'of',								// 2592
	'■': 'matrix, ',						// 25A0
	'▭': 'box',								// 25AD
	'☁': 'back color',						// 2601
	'★': 'complex conjugate',				// 2605 (for 'c.c.')
	'☆': 'conjugate',						// 2606 (for variable conjugate like '𝑧^∗')
	'☒': 'by',								// 2612 (as in '2 by 2 determinant')
	'☟': 'from',							// 261A (as in ∫ 'from' 0 'to' 1)
	'☛': 'goes to',							// 261B (as in lim_(𝑛→∞))
	'☝': 'to',								// 261D
	'⚡': 'power',							// 26A1 (as in 𝑥^(𝑛−1))
	'⛑': 'cap',							// 26D1 (for capital letter)
	'✎': 'color',							// 270E
	'⟡': 'phantom',							// 27E1
	'⟦': 'open white square bracket',		// 27E6
	'⟧': 'close white square bracket',		// 27E7
	'⟨': 'open angle bracket',				// 27E8
	'⟩': 'close angle bracket',				// 27E9
	'⨯': 'cross',							// 2A2F
	'⼖': 'enclosing',						// 2F16
	'⼞': 'enclosure',						// 2F1E
	'⬄': 'width phantom',					// 2B04
	'⬆': 'ascent smash',						// 2B06
	'⬇': 'descent smash',					// 2B07
	'⬌': 'width smash',						// 2B0C - horizontal smash
	'⬍': 'height smash',						// 2B0D
	'⬚': 'empty',							// 2B1A (for empty argument in fraction, sub/sup, etc.)
	'⬢': 'hex',								// 2B22 (for hex in color/back color)
	'⮵': 'to the',							// 2BB5
	'〖': ', ',								// 3016
	'〗': ', ',								// 3017
}

const functions = {
	'cos': 'cosine',
	'cot': 'cotangent',
	'csc': 'cosecant',
	'sec': 'secant',
	'sin': 'sine',
	'tan': 'tangent',
	'arccos': 'arccosine',
	'arccot': 'arccotangent',
	'arccos': 'arccosecant',
	'arcsec': 'arcsecant',
	'arcsin': 'arcsine',
	'arctan': 'arctangent',
	'cosh': 'hyperbolic cosine',
	'coth': 'hyperbolic cotangent',
	'csch': 'hyperbolic cosecant',
	'sech': 'hyperbolic secant',
	'sinh': 'hyperbolic sine',
	'tanh': 'hyperbolic tangent',
	'lim': 'limit',
}

const mathstyles = {
	// TeX unicode-math names in unimath-symbols.pdf to speech
	'mup': 'normal',
	'mbf': 'bold',
	'mit': 'italic',
	'mbfit': 'bold-italic',
	'Bbb': 'double-struck',
	'mbffrak': 'bold-fraktur',
	'mscr': 'script',
	'mbfscr': 'bold-script',
	'mfrak': 'fraktur',
	'msans': 'sans-serif',
	'mbfsans': 'bold-sans-serif',
	'mitsans': 'sans-serif-italic',
	'mbfitsans': 'sans-serif-bold-italic',
	'mtt': 'monospace',
};

const ordinals = {
	'1': 'first', '2': 'second', '3': 'third', '4': 'fourth', '5': 'fifth',
	'6': 'sixth', '7': 'seventh', '8': 'eighth', '9': 'ninth', '10': 'tenth'
}

function symbolSpeech(ch) {
	if (ch >= 'ℂ' && (ch <= 'ℴ' || ch > '〗')) {
		// Get speech for math alphanumerics
		let code = ch.codePointAt(0);
		let mathstyle;
		[mathstyle, ch] = foldMathAlphanumeric(code, ch);

		if (mathstyle) {
			if (ch > 'z')
				ch = symbolSpeechStrings[ch]; // Greek
				if (mathstyle == 'mit' || mathstyle == 'mup')
					mathstyle = '';			  // Suppress 'italic'
				else
				mathstyle = mathstyles[mathstyle] + ' ';
			let cap = inRange('A', ch, 'Z') ? 'cap ' : '';
			if (ch == 'a' || ch == 'A')
				ch = symbolSpeechStrings['A'];
			return mathstyle + cap + ch + ' ';
		}
	}
	// Get speech for operators and other symbols
	let ret = symbolSpeechStrings[ch];
	return ret ? ret + ' ' : ch;
}

const boxNotations = { 'left': '┠', 'right': '┨', 'top': '┯', 'bottom': '┷' }

const intervals = {
	'closed-open interval': '⏒',		// 23D2
	'open-closed interval': '⏓',		// 23D3
	'closed-interval': '⏔',			// 23D4
	'open-interval': '⏕'			// 23D5
}

function getPower(value) {
	if (value == '2')
		return '²';							// 'squared'

	if (value == '3')
		return '³';							// 'cubed'

	if (inRange('4', value, '10'))
		return '⮵' + ordinals[value] + ' '; // 'to the'

	return '⮵' + speech(value);				// 'to the'
}

function styleSpeech(mathStyle) {
	for (const [key, val] of Object.entries(mathvariants)) {
		if (val == mathStyle)
			return key;
	}
}

function findArg(value, arg) {
	if (value.attributes.arg && value.attributes.arg.textContent == arg)
		return value;

	for (let i = 0; i < value.children.length; i++) {
		let ret = findArg(value.children[i], arg)
		if (ret)
			return ret;
	}
	return '';
}

function checkIntent(value) {
	// Handle intents like "intent='derivative($n,$f,𝑥)'"
	if (!value.attributes || !value.attributes.intent)
		return '';							// No intent
	let intent = value.attributes.intent.textContent;
	if (intent[0] == ':') {
		if (intent.indexOf('derivative') == -1)
			return '';						// It's a property
		intent = intent.substring(1);
	}

	let i = intent.indexOf('(');
	if (i <= 0)
		return '';							// No name

	let args = [];
	let name = intent.substring(0, i);
	let j;
	let opDerivative = 'ď';					// Default 'partial-derivative'
	let ret = '';

	// Set args = intent arguments
	for (i++; i < intent.length; i = j + 1) {
		j = intent.indexOf(',', i);
		if (j == -1)
			j = intent.length - 1;
		let arg = intent.substring(i, j);
		if (arg[0] == '$')
			arg = speech(findArg(value, arg.substring(1)));
		args.push(arg);
	}

	if (name[0] == '$') {
		let val = findArg(value, name.substring(1));
		if (!val.attributes.intent)
			return '';
		ret = val.attributes.intent.textContent + '▒'; // intent + 'of'
		for (i = 0; i < args.length; i++) {
			ret += args[i];
			if (i < args.length - 1)
				ret += '&';
		}
		return ret;
	}

	if (name.indexOf('interval') != -1 && value.children.length == 3) {
		let val = value.children[1];
		name = intervals[name];
		if (name != undefined && val.children.length == 3) {
			// <interval> + 'from' + <start> + 'to' + <end>
			return name + '☟' + speech(val.children[0], true) + '☝' +
				speech(val.children[2], true);
		}
	}
	switch (name) {
		case 'derivative':
			if (args.length != 3)
				return '';
			opDerivative = 'đ';
											// Fall through to partial-derivative
		case 'partial-derivative':
			let order = args[0];
			if (order) {
				if (isAsciiDigit(order)) {
					order = order >= '2' ? ordinals[order] : '';
				} else if (order[0] == '(') {
					order = order.substring(1, order.length - 1);
					if (isAsciiDigit(order[order.length - 1])) {
						order = order.substring(0, order.length - 1) +
							ordinals[order[order.length - 1]];
					}
				} else {
					let code = codeAt(order, 0);
					order = foldMathItalic(code) + 'th';
				}
			}
			let arg = args[1] ? '▒' + args[1] : '';

			// E.g., "second derivative of f(x) with respect to x"
			ret = order + opDerivative + arg;
			if (args[2]) {
				ret += 'ŵ' + args[2];
				for (i = 3; i < args.length; i++) // Partial deriv's may have more wrt's
					ret += '&' + args[i];
			}
			break;
	}
	return ret;
}

function unary(node, op) {
	return op + speech(node.firstElementChild);
}

function binary(node, op) {
	let ret = speech(node.firstElementChild);
	let retd = speech(node.children[1]);

	if (op == '/' && (ret.endsWith('^∗ )') || ret.endsWith('^† )'))) {
		// Remove superfluous build-up space & parens
		ret = ret.substring(1, ret.length - 2);
	}
	ret += op + retd;
	if (op)
		ret += ' ';
	return ret;
}

function ternary(node, op1, op2) {
	return speech(node.firstElementChild) + op1 + speech(node.children[1]) +
		op2 + speech(node.lastElementChild) + ' ';
}

function nary(node, op, cNode) {
	let ret = '';

	for (let i = 0; i < cNode; i++) {
		// Get the rows
		ret += speech(node.children[i]);
		if (i < cNode - 1)
			ret += op;
	}
	return ret;
}


function speech(value, noAddParens) {
	function Nary(node) {
		// symbol 'from' lower-limit 'to' upper-limit 'of'
		return speech(node.firstElementChild) + '☟' +	// 'from'
			speech(node.children[1], true) + '☝' +		// 'to'
			speech(node.lastElementChild, true) + '▒';	// 'of'
	}

	// Function called recursively to convert MathML to speech
	let cNode = value.children.length;
	let ret = '';

	ret = checkIntent(value);				// Check for MathML intent
	if (ret)
		return ret;							// Intent overrules default speech

	switch (value.nodeName) {
		case 'mtable':
			ret = cNode + '☒';				// cNode 'by' ...
			var symbol = '■';				// 'matrix'
			var sep = '@';					// 'row'
			let intnt = '';
			let the = 'ⓣ';

			if (value.parentElement.attributes.hasOwnProperty('intent'))
				intnt = value.parentElement.attributes.intent.nodeValue;

			if (value.attributes.hasOwnProperty('intent') &&
				value.attributes.intent.value == ':equations') {
				symbol = '█';				// 'equation array'
				sep = '⍈';					// 'equation'
				if (intnt == ':cases') {
					sep = '⍆';				// 'case'
					symbol = 'Ⓒ';			// 'cases'
				}
				the = '';
				ret = cNode + ' ' + symbol;
			} else if (intnt) {
				for (const [key, val] of Object.entries(matrixIntents)) {
					if (val == intnt) {
						if (val != ':parenthesized-matrix')
							symbol = key;
						break;
					}
				}
			} else if (value.firstElementChild.nodeName == 'mlabeledtr' &&
				value.firstElementChild.children.length == 2 &&
				value.firstElementChild.firstElementChild.firstElementChild.nodeName == 'mtext') {
				// Numbered equation: convert to UnicodeMath like 𝐸=𝑚𝑐²#(20)
				let eqno = value.firstElementChild.firstElementChild.firstElementChild.textContent;
				return speech(value.firstElementChild.lastElementChild.firstElementChild) +
					'#' + eqno.substring(1, eqno.length - 1);
			} else if (value.parentElement.nodeName != 'mrow' ||
				!value.previousElementSibling ||
				value.previousElementSibling.nodeName != 'mo') {
				symbol = '═⏳';				// 'lines'
				sep = '━';					// 'line'
				ret = cNode + ' ' + symbol;
				the = '';
			}
			if (ret.endsWith('☒'))
				ret += value.firstElementChild.children.length + symbol;
			for (let i = 0; i < cNode; i++) {
				ret += sep + (i + 1) + '⏳' + speech(value.children[i]);
			}
			return the ? the + ret + '¶' + symbol : ret;

		case 'mtr':
			var op = '⏳';
			if (value.parentElement.attributes.hasOwnProperty('intent') &&
				value.parentElement.attributes.intent.textContent.endsWith('equations'))
				op = '';
			return nary(value, op, cNode);

		case 'mtd':
			return nary(value, '', cNode);

		case 'menclose':
			let notation = '';
			ret = speech(value.firstElementChild, true);

			if (!value.attributes.hasOwnProperty('notation'))
				return '▭' + ret + '¶▭';

			notation = value.attributes.notation.nodeValue;

			for (const [key, val] of Object.entries(symbolClasses)) {
				if (val == notation) {
					return key + ' ' + ret + '¶' + key;
				}
			}
			let nota = notation.split(' ').map(c => {
				if (c in boxNotations)
					return boxNotations[c];
			});
			// E.g., 'line on right left enclosing c + b , end enclosure'
			return '─' + nota.join('') + '⼖' + ret + '¶⼞';

		case 'mphantom':
			// Full size, no display
			return '⟡' + speech(value.firstElementChild, true) + '¶⟡';

		case 'mpadded':
			var op = '';
			var mask = 0;                   // Compute phantom mask

			if (value.attributes.width && value.attributes.width.nodeValue == '0')
				mask = 2;                   // fPhantomZeroWidth
			if (value.attributes.height && value.attributes.height.nodeValue == '0')
				mask |= 4;                  // fPhantomZeroAscent
			if (value.attributes.depth && value.attributes.depth.nodeValue == '0')
				mask |= 8;                  // fPhantomZeroDescent

			if (value.firstElementChild.nodeName == 'mphantom') { // No display
				if (mask == 2)
					op = '⇳';               // fPhantomZeroWidth
				else if (mask == 12)
					op = '⬄';              // fPhantomZeroAscent | fPhantomZeroDescent
				return op ? op + speech(value.firstElementChild, true).substring(1)
					: '⟡(' + mask + '&' + speech(value.firstElementChild.firstElementChild, true) + ')';
			}
			const opsShow = { 2: '⬌', 4: '⬆', 8: '⬇', 12: '⬍' };
			op = opsShow[mask];
			mask |= 1;                      // fPhantomShow

			return op ? unary(value, op)
				: '⟡(' + mask + '&' + speech(value.firstElementChild, true) + ')';

		case 'mstyle':
			ret = speech(value.firstElementChild);
			if (value.attributes.hasOwnProperty('mathcolor')) {
				let color = value.attributes.mathcolor.value;
				if (color[0] == '#')
					color = '⬢ ' + color.substring(1) + '⏳';
				ret = '✎' + color + ' ' + ret + '¶✎';
			}
			if (value.attributes.hasOwnProperty('mathbackground')) {
				let color = value.attributes.mathbackground.value;
				if (color[0] == '#')
					color = '⬢ ' + color.substring(1) + '⏳';
				ret = '☁' + color + ' ' + ret + '¶☁';
			}
			return ret;

		case 'msqrt':
			ret = speech(value.firstElementChild, true);
			return needParens(ret) ? '√⏳' + ret + '¶√' : '√⏳' + ret;

		case 'mroot':
			return '⒭' + speech(value.lastElementChild, true) + '▒' +
				speech(value.firstElementChild, true) + '¶⒭';

		case 'mfrac':
			var op = '/';
			let num = speech(value.firstElementChild, true);
			let den = speech(value.lastElementChild, true);

			if (value.attributes.hasOwnProperty('linethickness')) {
				var val = value.attributes.linethickness.nodeValue;
				if (val == '0' || val == '0.0pt') {
					op = '¦';
					if (value.parentElement.attributes.hasOwnProperty('intent') &&
						value.parentElement.attributes.intent.nodeValue.startsWith('binomial-coefficient') ||
						value.parentElement.firstElementChild.attributes.title &&
						value.parentElement.firstElementChild.attributes.title.nodeValue == 'binomial coefficient') {
						ret = (needParens(num) ? '(' + num + ')' : num) + ' ⒞';
						ret += (needParens(den) ? '(' + den + ')' : den) + ' ';
						op = '⒞';
					}
				}
			}
			if (op == '/') {
				if (needParens(num) || needParens(den) ||
					value.parentElement.nodeName == 'mfrac') {
					ret = '⍁' + num + "/" + den + '¶⍁';
				} else if (isAsciiDigit(num) && (isAsciiDigit(den) || den == '10')) {
					ret = (num == '1')
						? getUnicodeFraction(num, den)
						: num + String.fromCodePoint(den.charCodeAt(0) + 0x2050);
				} else {
					ret = num + '/' + den;
				}
			} else if (op != '⒞') {
				ret = binary(value, op);
			}
			if (value.previousElementSibling && value.previousElementSibling.nodeName != 'mo')
				ret = '⏳' + ret;		// Pause betw. variable & numerator
			return ret;

		case 'msup':
			if (value.attributes.intent && value.attributes.intent.textContent == ':sup')
				return speech(value.firstElementChild) + '^' + speech(value.lastElementChild);

			if (value.lastElementChild.nodeName == 'mn' &&
				isAsciiDigit(value.lastElementChild.textContent[0])) {
				let power = getPower(value.lastElementChild.textContent);
				return speech(value.firstElementChild) + power;
			}
			if (value.lastElementChild.attributes.hasOwnProperty('intent') &&
				value.lastElementChild.attributes.intent.nodeValue == 'transpose') {
				return speech(value.firstElementChild) + '⏉';	// 'transpose'
			}
			if (isPrime(value.lastElementChild.textContent))
				return binary(value, '');

			if (value.lastElementChild.textContent == '∗')
				return speech(value.firstElementChild) + '☆';	// 'conjugate'

			ret = speech(value.lastElementChild, true);
			return speech(value.firstElementChild) + '⮵' + ret +
				(needParens(ret) ? '⚡' : '⏳');	// 'power' : pause

		case 'mover':
			if (value.attributes.hasOwnProperty('accent'))
				return binary(value, '');

			return 'modified ' + speech(value.firstElementChild, true) +
				'⁐' + speech(value.lastElementChild, true) + '┴'; // 'with' ... 'above'

		case 'munder':
			if (value.firstElementChild.innerHTML == 'lim') {
				return speech(value.firstElementChild) + '⍨' +	// 'limit as' ... 'of'
					speech(value.lastElementChild, true) + '▒';
			}
			if (value.attributes.hasOwnProperty('accentunder'))
				return binary(value, '');

			return 'modified ' + speech(value.firstElementChild, true) +
				'⁐' + speech(value.lastElementChild, true) + '┬'; // 'with' ... 'below'

		case 'msub':
			return binary(value, '_');

		case 'munderover':
			if (!value.parentElement.attributes.hasOwnProperty('intent') ||
				isNary(value.firstElementChild.innerHTML))
					return Nary(value);
			return ternary(value, '┬', '┴');

		case 'msubsup':
			if (value.lastElementChild.nodeName == 'mn' &&
				isAsciiDigit(value.lastElementChild.textContent[0])) {
				let power = getPower(value.lastElementChild.textContent);
				return binary(value, '_') + power;
			}
			if (isPrime(value.lastElementChild.textContent)) {
				return speech(value.firstElementChild) +
					value.lastElementChild.textContent + '_' + speech(value.children[1])
			}
			return isNary(value.firstElementChild.innerHTML)
				? Nary(value) : ternary(value, '_', '⮵');	// 'to the'

		case 'mmultiscripts':
			ret = '';
			if (value.children[3].nodeName == 'mprescripts') {
				if (value.children[4].nodeName != 'none')
					ret = '_' + speech(value.children[4]);
				if (value.children[5].nodeName != 'none')
					ret += '^' + speech(value.children[5]);
				if (ret)
					ret += ' ';
			}
			ret += speech(value.children[0]);
			if (value.children[1].nodeName != 'none')
				ret += '_' + speech(value.children[1]);
			if (value.children[2].nodeName != 'none')
				ret += '^' + speech(value.children[2]);
			return ret;

		case 'mfenced':
			let opOpen = value.hasAttribute('open') ? value.getAttribute('open') : '(';
			let opClose = value.hasAttribute('close') ? value.getAttribute('close') : ')';
			let opSeparators = value.hasAttribute('separators')
				? value.getAttribute('separators') : ',';
			let cSep = opSeparators.length;

			ret = opOpen;
			for (let i = 0; i < cNode; i++) {
				ret += speech(value.children[i]);
				if (i < cNode - 1)
					ret += i < cSep - 1 ? opSeparators[i] : opSeparators[cSep - 1];
			}
			return ret + opClose;

		case 'mo':
			var val = value.innerHTML;
			if (val == '\u2062')			// Ignore invisible times
				return '';

			if (val == '{' && value.parentElement.attributes.intent &&
				value.parentElement.attributes.intent.nodeValue == ':cases') {
				return '';					// Don't add 'open brace'
			}

			if (val[0] == '&') {
				if (val.startsWith('&#') && val.endsWith(';')) {
					ret = value.innerHTML.substring(2, val.length - 1);
					if (ret[0] == 'x')
						ret = '0' + ret;
					val = String.fromCodePoint(ret);
				} else switch (val) {
					case '&ApplyFunction;':
						val = '\u2061';
						break;
					case '&lt;':
						val = '<';
						break;
					case '&gt;':
						val = '>';
						break;
				}
			}
			if (value.attributes.title) {
				// The DLMF title attribute implies the following intents
				// (see also for 'mi')
				switch (value.attributes.title.textContent) {
					case 'binomial coefficient':
						return '';
				}
			}
			if (val == '→' && value.parentElement.nodeName == 'mrow' &&
				value.parentElement.parentElement.nodeName == 'munder' &&
				value.parentElement.parentElement.firstElementChild.innerHTML == 'lim') {
				return '☛';					// 'goes to'
			}
			return val;

		case 'mi':
			let c = value.innerHTML;
			if (value.attributes.hasOwnProperty('mathvariant')) {
				// Convert to Unicode math alphanumeric. Conversion to speech
				// is done upon returning from the original speech() call.
				let mathstyle = mathvariants[value.attributes.mathvariant.nodeValue];
				if (c in mathFonts && mathstyle in mathFonts[c])
					c = mathFonts[c][mathstyle];
			} else if (c in functions) {
				c = functions[c] + ' ';
			}
			return c;

		case 'mn':
			return value.innerHTML;

		case 'mtext':
			if (value.textContent == 'c.c.')
				return '★';					// 'complex conjugate'
			return value.textContent + ' ';

		case 'mspace':
			if (value.attributes.hasOwnProperty('width')) {
				for (let i = 0; i < spaceWidths.length; i++) {
					if (value.attributes.width.nodeValue == spaceWidths[i])
						return uniSpaces[i];
				}
			}
			break;
	}

	let mrowIntent = value.nodeName == 'mrow' && value.attributes.hasOwnProperty('intent')
		? value.attributes.intent.nodeValue : '';

	if ((!mrowIntent || mrowIntent == ':fenced') && (cNode == 2 || cNode == 3)) {
		if (value.firstElementChild.textContent == '|' &&
			value.lastElementChild.textContent == '|') {
			mrowIntent = 'absolute-value';
		} else if (value.firstElementChild.textContent == '{' &&
			value.children[1].nodeName == 'mtable' &&
			(cNode == 2 || !value.lastElementChild.textContent ||
			 value.lastElementChild.textContent == '┤')) {
			value.setAttribute('intent', ':cases');
		} else if (cNode == 3 && value.firstElementChild.textContent == '(' &&
			value.children[1].nodeName == 'mtable' &&
			value.lastElementChild.textContent == ')') {
			return speech(value.children[1], true);	// Discard parens for 'matrix'
		}
	}

	if (mrowIntent.startsWith('absolute-value') ||
		mrowIntent.startsWith('cardinality')) {
		let op = mrowIntent[0] == 'a' ? '⒜' : 'ⓒ';
		ret = speech(value.children[1], true);
		return op + '▒' + ret + (needParens(ret) ? '¶' + op : '⏳');
	}

	for (var i = 0; i < cNode; i++) {
		let node = value.children[i];
		ret += speech(node, false, i);
	}

	if (mrowIntent) {
		if (mrowIntent.startsWith('binomial-coefficient') ||
			mrowIntent.endsWith('matrix') || mrowIntent.endsWith('determinant')) {
			// Remove enclosing parens for 𝑛⒞𝑘, bracketed matrices, determinants
			return ret.substring(1, ret.length - 1);
		}
		if (mrowIntent == ':function' && value.previousElementSibling &&
			value.firstElementChild.nodeName == 'mi' &&
			value.firstElementChild.textContent < '\u2100' &&
			value.previousElementSibling.nodeName == 'mi') {
			// Separate variable & function name
			return ' ' + ret;
		}
	}
	if (cNode > 1 && value.nodeName != 'math' && !noAddParens &&
		(!mrowIntent || mrowIntent != ':fenced') &&
		isMathMLObject(value.parentElement, true) && needParens(ret)) {
			ret = '(' + ret + ')';
	}
	return ret;
}

function MathMLtoSpeech(mathML) {
	const doc = getMathMLDOM(mathML);
	return getSpeech(doc);
}

function getSpeech(doc) {
	let text = speech(doc);					// Get speech symbols
	return resolveSymbols(text);
}
function resolveSymbols(text) {
	let ret = '';							// Collects speech
	let cchText = text.length;
	let ch;									// Current char
	let cchCh;								// Code count of current

	// Convert symbols to words and eliminate some spaces
	for (let i = 0; i < cchText; i += cchCh) {
		let mathstyle = '';
		let code = text.codePointAt(i);
		cchCh = code > 0xFFFF ? 2 : 1;

		if (text[i] == '\u2061') {
			if(ch != ' ')
				ret += ' ';
			ch = ' ';
			continue;
		}

		if (text[i] == ' ') {
			if (ch != ' ') {
				ret += ' ';
				ch = ' ';
			}
			continue;
		}
		if (text[i] == '(') {
			// For 𝑓(𝑥), say 'f of x' if possible
			let j = text.indexOf(')', i + 1);

			if (j != -1) {
				if (cchText > j && text[j + 1] == 'ŵ') { // 'with respect to'
					// Set up 'f of ' ... 'with respect to'
					ret += symbolSpeech('▒');	// 'of'
					continue;
				}
				let ch1 = i ? text[i - 1] : '';

				if (isAsciiAlphabetic(ch1) || inRange('\uDC00', ch1, '\uDFFF') ||
					isGreek(ch1) || inRange('\u0300', ch1, '\u036F')) {
					// Paren preceded by variable. Check for argument list
					let arglist = '';
					let cchCh;
					let k;
					for (k = i + 1; k < j; k += cchCh) {
						let code = text.codePointAt(k);
						cchCh = code > 0xFFFF ? 2 : 1;
						ch1 = String.fromCodePoint(code);
						if (!isAlphanumeric(ch1) && ch1 != ',' && ch1 != '′')
							break;
						arglist += symbolSpeech(ch1);
					}
					if (k == j) {
						// Parens enclose an argument list & are preceded by a
						// variable: say 'of' + char instead of '(' + char + ')'.
						// For example, say 'f of x' instead of 'f(x)'.
						ret += symbolSpeech('▒') + arglist;	// 'of' + arglist
						if (j + 1 < text.length)
							ret += !'/='.includes(text[j + 1]) ? symbolSpeech('⏳') : ' ';
						i = j;
						cchCh = 0;
						continue;
					}
				}
			}
		} else if (text[i] == ')' && cchText > i + 1 && text[i + 1] == 'ŵ') {
			continue;			// Don't need ')' since 'ŵ' terminates arg list
		}
		if (isAsciiDigit(ch) && !isAsciiDigit(text[i]))
			ret += ' ';
		ch = text.substring(i, i + cchCh);

		if (isAsciiAlphanumeric(ch) && ch != '_') {
			ret += ch;
			continue;
		}
		let c = symbolSpeech(ch);
		if (c != ch) {
			ch = c;
			if (i && isAsciiAlphabetic(text[i - 1]))
				ret += ' ';
			ret += ch;
			ch = ' ';
			continue;
		}
		ret += ch + ' ';
		ch = ' ';
	}
	ret = ret.trimEnd();
	if (ret.endsWith(','))
		ret = ret.substring(0, ret.length - 1);
	return ret;
}