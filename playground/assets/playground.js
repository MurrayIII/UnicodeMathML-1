'use strict';

var dictateButton = document.getElementById('dictation')
var codepoints = document.getElementById("codepoints");
var input = document.getElementById("input");
var measurements_parse = document.getElementById("measurements_parse");
var measurements_pretty = document.getElementById("measurements_pretty");
var measurements_transform = document.getElementById("measurements_transform");
var output = document.getElementById("output");
var output_mathml_ast = document.getElementById("output_mathml_ast");
var output_pegjs_ast = document.getElementById("output_pegjs_ast");
var output_preprocess_ast = document.getElementById("output_preprocess_ast");
var output_source = document.getElementById("output_source");

var activeTab = "source";
var anchorNode
var atEnd = false;                          // True if at end of output object
var contextmenuNode
var focusNode
var hist = [];
var inputRedoStack = []
var inputUndoStack = [{uMath: ''}]
var inSelChange = false
var keydownLast
var outputRedoStack = ['']
var outputUndoStack = ['']
var prevInputValue = "";
var selectionEnd                            // Used when editing input
var selectionStart                          // Used when editing input
var shadedArgNode                           // Used for IP when editing output

const SELECTNODE = -1024

function getMathJaxMathMlNode() {
    /* MathJax output-element DOM has the form:
       <mjx-container
         <svg
         <mjx-assistive-mml
           <mjx-container
             <svg
             <mjx-assistive-mml
               <math ...
     */
    let node = output.firstElementChild.lastElementChild.firstElementChild
    console.log('nodename = ' + node.nodeName)
    if (node.nodeName == 'MJX-CONTAINER')
        node = node.lastElementChild.firstElementChild
    return node
}

function removeSelMarkers(uMath) {
    // Return uMath without selection markers Ⓐ(...) and Ⓕ(...)
    let index1, index2, end1, end2

    for (let i = 0; i < uMath.length; i++) {
        let ch = uMath[i]

        if (ch == 'Ⓐ' || ch == 'Ⓕ') {
            if (uMath[i + 1] != '(') {
                console.log('Invalid selection marker' + uMath)
                return null
            }
            let index = i
            i += 2
            let offset = uMath[i] == '-' ? uMath[i++] : ''
            if (uMath[i] != ')')
                offset += uMath[i++]
            if (uMath[i] != ')') {
                console.log('Invalid selection marker' + uMath)
                return null
            }
            if (!index1) {
                index1 = index
                end1 = i + 1
            } else {
                index2 = index
                end2 = i + 1
            }
        }
    }
    // Remove marker(s) from uMath
    if(!index2)
        uMath = uMath.substring(0, index1) + uMath.substring(end1)
    else
        uMath = uMath.substring(0, index1) + uMath.substring(end1, index2) + uMath.substring(end2)
    //console.log('uMathNoSelAttr = ' + uMath)
    return uMath
}

document.onselectionchange = () => {
    if (shadedArgNode) {
        shadedArgNode.removeAttribute('mathbackground')
        shadedArgNode = null
    }
    if (output.firstElementChild && output.firstElementChild.nodeName == 'MJX-CONTAINER')
        return
    if (inSelChange)
        return

    let sel = window.getSelection()
    inSelChange = true
    sel = checkMathSelection(sel)
    inSelChange = false
    if (!sel)
        return                              // Not math output window

    // In math output window
    removeSelAttributes()
    let offset = sel.anchorOffset
    anchorNode = sel.anchorNode
    if (anchorNode.nodeName == '#text') {
        anchorNode = anchorNode.parentElement
        offset = '-' + offset               // Indicate offset is a #text offset
    }
    setSelAttributes(anchorNode, 'selanchor', offset)

    if (sel.focusOffset != sel.anchorOffset || sel.focusNode != sel.anchorNode) {
        // Nondegenerate selection
        offset = sel.focusOffset
        focusNode = sel.focusNode
        if (focusNode.nodeName == '#text') {
            focusNode = focusNode.parentElement
            offset = '-' + offset
        }
        setSelAttributes(focusNode, 'selfocus', offset)
    }
    // Update MathML window
    if (!testing) {
        output_source.innerHTML = highlightMathML(escapeMathMLSpecialChars(indentMathML(output.innerHTML)));
        console.log('uMath = ' + getUnicodeMath(output.firstElementChild, true))
        input.innerHTML = getUnicodeMath(output.firstElementChild, false)
    }
    shadeArgNode()
}

function shadeArgNode() {
    // Shade MathML argument node containing the IP
    let sel = window.getSelection()
    if (sel.isCollapsed) {
        let node = sel.anchorNode
        if (node.nodeName == '#text')
            node = node.parentElement
        for (; node && node.nodeName[0] == 'm' && node.nodeName != 'math';
            node = node.parentElement) {
            if (isMathMLObject(node.parentElement) || node.parentElement.nodeName == 'mtd' ||
                !node.childElementCount && node.textContent.length > getCch(node.textContent, 0)) {
                node.setAttribute('mathbackground', '#666')
                shadedArgNode = node
                return
            }
        }
    }
}

function getChildIndex(node, nodeP) {
    // If nodeP isn't an ancestor of node, return -1. Else return the
    // nodeP child index of child that is the node or contains the node.
    if (!nodeP.childElementCount)
        return -1                           // No children

    for (; node && node.parentElement != nodeP; node = node.parentElement)
        ;                                   // Move up to nodeP child
    if (!node)
        return -1                           // Not found

    let iChild = 0
    for (; iChild < nodeP.childElementCount && node != nodeP.children[iChild]; iChild++)
        ;                                   // Find child index
    return iChild
}

function setSelectionEx(sel, node, offset, e) {
    e.preventDefault()
    if (e.shiftKey)
        sel.setBaseAndExtent(sel.anchorNode, sel.anchorOffset, node, offset)
    else
        sel.setBaseAndExtent(node, offset, node, offset)
    if (testing)
        document.onselectionchange()
}

function setSelection(sel, node, offset, nodeFocus, offsetFocus) {
    if (!sel)
        sel = window.getSelection()
    if (!node)
        return sel

    if (offset == SELECTNODE) {
        offset = node.nodeName == '#text'
               ? node.textContent.length : node.childNodes.length
        sel.setBaseAndExtent(node, 0, node, offset)
        return
    }

    if (node.nodeName == 'mtext')
        node = node.firstChild
    if (offset < 0) {                       // Text offset (not child index)
        offset = -offset
        if (node.nodeName != '#text')
            node = node.firstChild          // Should be '#text' now
    }
    if (nodeFocus) {
        if (offsetFocus < 0) {              // Text offset (not child index)
            offsetFocus = -offsetFocus
            if (nodeFocus.nodeName != '#text')
                nodeFocus = nodeFocus.firstChild
        }
    } else {                                // Make an insertion point (IP)
        nodeFocus = node
        offsetFocus = offset
    }
    try {
        if (node.nodeName == '#text') {
            if (offset > node.textContent.length)
                offset = offsetFocus = node.textContent.length
        } else if (offset > node.childNodes.length) {
            offset = offsetFocus = node.childNodes.length
        }
        sel.setBaseAndExtent(node, offset, nodeFocus, offsetFocus)
    } catch(error) {
        console.log(error)
        console.log("output = " + output.firstElementChild.outerHTML)
        console.log("sel.anchorNode = " + node.outerHTML + ', sel.anchorOffset = ' + offset)
        console.log("sel.focusNode = " + nodeFocus.outerHTML + ', sel.focusOffset = ' + offsetFocus)
    }

    if(!testing)
        console.log("sel.anchorNode = " + node.nodeName + ', sel.focusNode = ' + nodeFocus.nodeName)
    return sel
}

const mappedPair = {
    "+-": "\u00B1", "<=": "\u2264", ">=": "\u2265", "~=": "\u2245",
    "~~": "\u2248", "::": "\u2237", ":=": "\u2254", "<<": "\u226A",
    ">>": "\u226B", "−>": "\u2192", "−+": "\u2213", "!!": "\u203C", "...": "…"
}

const mappedSingle = {"-": "\u2212", "\'": "\u2032"}

////////////////////
// DEMO FUNCTIONS //
////////////////////

var demoID = 0;
var demoPause = false;
var iExample = 0;                           // Index of next Examples[] equation

function startDemo() {
    if (demoID) {
        // Already running demo: turn it off
        endDemo()
        return;
    }
    nextEq();
    demoID = setInterval(nextEq, 3000);     // Display next equation every 3 seconds
    demoPause = false;                      // Not paused (pause by entering ' ')
    var demoEq = document.getElementById('demos');
    demoEq.style.backgroundColor = 'DodgerBlue'; // Show user demo mode is active
}

function endDemo() {
    var demoEq = document.getElementById('demos');
    clearInterval(demoID);
    demoID = 0;
    demoEq.style.backgroundColor = 'inherit';
    demoEq.style.color = 'inherit';
}

function nextEq() {
    // Send Alt+Enter to display Examples[iExample] equation
    input.focus();
    const event = new Event('keydown');
    event.key = 'Enter';
    event.altKey = true;
    document.dispatchEvent(event);
    outputUndoStack = ['']
    draw();
}

function prevEq() {
    iExample -= 2;
    if (iExample < 0)
        iExample = cExamples - 1;
    nextEq();
}

function stackTop(arr) {
    return arr.length ? arr[arr.length - 1] : ''
}

function mathBraille() {
    // Called if Braille button is clicked on
    input.focus();
    const event = new Event('keydown');
    event.key = 'b';
    event.altKey = true;
    document.dispatchEvent(event);
}

function mathSpeak() {
    // Called if Speak button is clicked on
    input.focus();
    const event = new Event('keydown');
    event.key = 's';
    event.altKey = true;
    document.dispatchEvent(event);
}

function mathTeX() {
    let LaTeX = TeX(output.firstElementChild)
    console.log('Math TeX = ' + LaTeX)
    speechDisplay.innerText += '\n' + LaTeX
}

function speak(s) {
    if(!testing)
        console.log(s)
    s = symbolSpeech(s)
    let utterance = new SpeechSynthesisUtterance(s)
    if (voiceZira)
        utterance.voice = voiceZira
    if (speechSynthesis.pending)        // Inter-utterance pause is too long
        speechSynthesis.cancel()
    //utterance.rate = 2
    speechSynthesis.speak(utterance)
}

function setUnicodeMath(uMath) {
    if (!uMath)
        uMath = '⬚'
    let i = uMath.indexOf('"')
    if (i != -1 && uMath[i + 1] == '\\' && uMath[i + 2] != '"') {
        let j = uMath.indexOf('"', i + 1)
        if (j != -1) {
            // Remove quotes around partial control words to aid parser
            uMath = uMath.substring(0, i) + uMath.substring(i + 1, j) +
                uMath.substring(j + 1)
        }
    }
    let t = unicodemathml(uMath, true) // uMath → MathML
    output.innerHTML = t.mathml

    if (!testing) {
        output_source.innerHTML = highlightMathML(escapeMathMLSpecialChars(indentMathML(output.innerHTML)));
        if (t.details["intermediates"]) {
            let pegjs_ast = t.details["intermediates"]["parse"];
            let preprocess_ast = t.details["intermediates"]["preprocess"];
            output_pegjs_ast.innerHTML = highlightJson(pegjs_ast) + "\n";
            output_preprocess_ast.innerHTML = highlightJson(preprocess_ast) + "\n";
        }
    }
    refreshDisplays('', true)
}

var symbolNames = {}

Object.entries(controlWords).forEach(([key, value]) => {
    if (symbolNames[value])
        symbolNames[value] += ', \\' + key
    else
        symbolNames[value] = key
})

// escape mathml tags and entities, via https://stackoverflow.com/a/13538245
function escapeMathMLSpecialChars(str) {
    var replacements = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;'
    };
    return str.replace(/[&<>]/g, tag => {
        return replacements[tag] || tag;
    });
};

// via https://stackoverflow.com/a/49458964
function indentMathML(str) {
    var formatted = '', indent = '';
    str.split(/>\s*</).forEach(node => {
        if (node.match(/^\/\w/)) {
            indent = indent.substring(2);   // End tag decreases indent
        } else {
            formatted += '\n' + indent;     // Start tag gets new line indented
        }
        formatted += '<' + node + '>';      // Append tag(s), content
        if (node.match(/^<?\w[^>]*[^\/]$/))
            indent += '  ';
    });
    return formatted.substring(2, formatted.length - 1);
};

// loosely based on https://www.w3schools.com/howto/howto_syntax_highlight.asp
function highlightMathML(mathml) {
    mathml = mathmlMode(mathml);
    return mathml;

    function extract(str, start, end, func, repl) {
        var s, e, d = "", a = [];
        while (str.search(start) > -1) {
            s = str.search(start);
            e = str.indexOf(end, s);
            if (e == -1) {e = str.length;}
            if (repl) {
                a.push(func(str.substring(s, e + (end.length))));
                str = str.substring(0, s) + repl + str.substr(e + (end.length));
            } else {
                d += str.substring(0, s);
                d += func(str.substring(s, e + (end.length)));
                str = str.substr(e + (end.length));
            }
        }
        this.rest = d + str;
        this.arr = a;
    }
    function mathmlMode(txt) {
        var rest = txt, done = "", comment, angular, startpos, endpos, note, i;
        comment = new extract(rest, "&lt;!--", "--&gt;", commentMode, "W3HTMLCOMMENTPOS");
        rest = comment.rest;
        while (rest.indexOf("&lt;") > -1) {
            startpos = rest.indexOf("&lt;");
            endpos = rest.indexOf("&gt;", startpos);
            if (endpos == -1) {endpos = rest.length;}
            done += rest.substring(0, startpos);
            done += tagMode(rest.substring(startpos, endpos + 4));
            rest = rest.substr(endpos + 4);
        }
        rest = done + rest;
        for (i = 0; i < comment.arr.length; i++) {
            rest = rest.replace("W3HTMLCOMMENTPOS", comment.arr[i]);
        }
        return "<span class=\"text\">" + rest + "</span>";
    }
    function tagMode(txt) {
        var rest = txt, done = "", startpos, endpos, result;
        while (rest.search(/(\s|<br>)/) > -1) {
            startpos = rest.search(/(\s|<br>)/);
            endpos = rest.indexOf("&gt;");
            if (endpos == -1) {endpos = rest.length;}
            done += rest.substring(0, startpos);
            done += attributeMode(rest.substring(startpos, endpos));
            rest = rest.substr(endpos);
        }
        result = done + rest;
        result = "<span class=\"bracket\">&lt;</span>" + result.substring(4);
        if (result.substr(result.length - 4, 4) == "&gt;") {
            result = result.substring(0, result.length - 4) + "<span class=\"bracket\">&gt;</span>";
        }
        return "<span class=\"tag\">" + result + "</span>";
    }
    function attributeMode(txt) {
        var rest = txt, done = "", startpos, endpos, singlefnuttpos, doublefnuttpos, spacepos;
        while (rest.indexOf("=") > -1) {
            endpos = -1;
            startpos = rest.indexOf("=") + 1;
            singlefnuttpos = rest.indexOf("'", startpos);
            doublefnuttpos = rest.indexOf('"', startpos);
            spacepos = rest.indexOf(" ", startpos + 2);
            if (spacepos > -1 && (spacepos < singlefnuttpos || singlefnuttpos == -1) && (spacepos < doublefnuttpos || doublefnuttpos == -1)) {
                endpos = rest.indexOf(" ", startpos);
            } else if (doublefnuttpos > -1 && (doublefnuttpos < singlefnuttpos || singlefnuttpos == -1) && (doublefnuttpos < spacepos || spacepos == -1)) {
                endpos = rest.indexOf('"', rest.indexOf('"', startpos) + 1);
            } else if (singlefnuttpos > -1 && (singlefnuttpos < doublefnuttpos || doublefnuttpos == -1) && (singlefnuttpos < spacepos || spacepos == -1)) {
                endpos = rest.indexOf("'", rest.indexOf("'", startpos) + 1);
            }
            if (!endpos || endpos == -1 || endpos < startpos) {endpos = rest.length;}
            done += rest.substring(0, startpos);
            done += attributeValueMode(rest.substring(startpos, endpos + 1));
            rest = rest.substr(endpos + 1);
        }
        return "<span class=\"attribute\">" + done + rest + "</span>";
    }
    function attributeValueMode(txt) {
        return "<span class=\"value\">" + txt + "</span>";
    }
    function commentMode(txt) {
        return "<span class=\"comment\">" + txt + "</span>";
    }
}

// via https://stackoverflow.com/a/7220510 plus compact indentation
function highlightJson(json) {
    if (json == undefined)
        return '';
    if (typeof json != 'string') {
        json = JSON.stringify(json, undefined);
    }
    // Insert compact indents
    var indent = '';
    var chPrev = '';
    var json1 = '';
    var cJson = json.length;

    for (var i = 0; i < cJson; i++) {
        var ch = json[i];
        switch (ch) {
            case '{':
            case '[':
                if (chPrev == '[' || chPrev == '{' || chPrev == ',')
                    json1 += '\n' + indent;
                indent += !(indent.length % 4) ? '·\u00A0' : '\u00A0\u00A0';
                break;
            case '}':
            case ']':
                indent = indent.substring(0, indent.length - 2);
                break;
            case '"':
                if (!isAsciiAlphanumeric(chPrev) &&
                    (chPrev != '\u00A0' || i > 2 && json[i - 2] != ':') &&
                    json[i + 1] != '}' && json[i + 1] != ',') {
                    json1 += '\n' + indent;
                }
                break;
            case ':':
                json1 += ':';
                ch = '\u00A0';
                if (i < cJson - 2 && json[i + 1] == '"') {
                    json1 += ch;
                    ch = json[i++ + 1];
                }
        }
        json1 += ch;
        chPrev = ch;
    }
    json = escapeMathMLSpecialChars(json1);

    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, match => {
        var cls = 'number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'key';
            } else {
                cls = 'string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'boolean';
        } else if (/null/.test(match)) {
            cls = 'null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}

function hexToUnicode(input, offsetEnd, cchSel) {
    if (cchSel > 10)
        return [0, 0];
    let offsetStart = offsetEnd - cchSel;
    let cch = cchSel ? cchSel : 10;         // 10 is enough for 5 surrogate pairs
    let ch = '';
    let [n, i] = GetCodePoint(input, offsetEnd, cch);
    if (n)
        offsetStart = i

    if (n < 0x20 || n > 0x10FFFF) {
        if (n || cchSel)
            return [0, 0];
        // Convert ch to hex str. Sadly code.toString(16) only works correctly
        // for code <= 0xFFFF
        n = codeAt(input, offsetEnd - 1);
        offsetStart--;
        if (n <= 0xFFFF) {                  // toString truncates larger values
            ch = n.toString(16);
        } else {
            offsetStart--;
            for (let d = 1; d < n; d <<= 4)	// Get d = smallest power of 16 > n
                ;
            if (n && d > n)
                d >>= 4;
            for (; d; d >>= 4) {
                let quot = n / d;
                let rem = n % d;
                n = quot + 0x0030;
                if (n > 0x0039)
                    n += 0x0041 - 0x0039 - 1;
                ch += String.fromCharCode(n);
                n = rem;
            }
        }
    } else {
        if (n <= 0xFFFF) {
            ch = String.fromCharCode(n);
            if (isTrailSurrogate(n) && offsetStart > 5) {
                let chPrev = input[offsetStart - 1];
                if (chPrev == ' ' || chPrev == ',') {
                    [m, i] = GetCodePoint(input, offsetStart - 1, 8);
                    if (isLeadSurrogate(m)) {
                        ch = String.fromCharCode(m) + ch;
                    }
                }
            }
        } else {
            ch = String.fromCharCode(0xD7C0 + (n >> 10)) +
                 String.fromCharCode(0xDC00 + (n & 0x3FF));
        }
    }
    return [ch, offsetEnd - offsetStart]
}

function boldItalicToggle(chars, key) {
    // Get current bold and italic states from first char in selection
    if (!chars)
        return;                             // Nothing selected
    var code = chars.codePointAt(0);
    var ch = chars[0];
    var [font, chFolded] = foldMathAlphanumeric(code, ch);
    var bold = font.startsWith('mbf');
    var italic = bold ? font.substring(3, 5) == 'it' : font.startsWith('mit');
    var symbols = '';

    // Toggle bold/italic state of selected characters
    for (var i = 0; i < chars.length; i++) {
        code = chars.codePointAt(i);
        ch = chars[i];
        if (code > 0xFFFF) {
            ch = chars.substring(i, i + 2);
            i++;
        }

        [font, chFolded] = foldMathAlphanumeric(code, ch);
        switch (key) {
            case 'i':
                if (italic) {
                    font = (font.length == 3) ? 'mup'
                         : bold ? 'mbf' + font.substring(5)
                         : 'm' + font.substring(3);
                } else {
                    font = (font == 'mup') ? font = 'mit'
                         : bold ? 'mbfit' + font.substring(3)
                         : 'mit' + font.substring(1);
                }
                break;
            case 'b':
                if (bold) {
                    font = (font.length == 3) ? 'mup' : 'm' + font.substring(3);
                } else {
                    font = (font == 'mup') ? 'mbf' : 'mbf' + font.substring(1);
                }
                break;
        }
        if (font == 'mup') {
            symbols += chFolded;
        } else {
            symbols += (chFolded in mathFonts && font in mathFonts[chFolded])
                ? mathFonts[chFolded][font] : ch;
        }
    }
    return symbols
}

function GetCodePoint(str, i, cch) {
    // Code point for hex string of max length cch in str ending at offset i
    if (cch > i)
        cch = i;
    if (cch < 1)
        return 0;

    var cchCh = 1;
    var cchChPrev = 1;
    var code = 0;
    var n = 0;                              // Accumulates code point

    for (var j = 0; cch > 0; j += 4, cch--) {
        code = str.codePointAt(i - 1);
        cchCh = 1;
        if (code < 0x0030)
            break;                          // Not a hexadigit

        if (isTrailSurrogate(code)) {
            code = str.codePointAt(i - 2);
            if (code < 0x1D434 || code > 0x1D467)
                break;                      // Surrogate pair isn't math italic
            code -= code >= 0x1D44E ? (0x1D44E - 0x0061) : (0x1D434 - 0x0061);
            cch--;
            cchCh = 2;
        }
        code |= 0x0020;                     // Convert to lower case (if ASCII uc letter)
        if (code >= 0x0061)                 // Map lower-case ASCII letter
            code -= 0x0061 - 0x003A;        //  to hex digit
        else if (code >= 0x003A)
            break;                          // Not a hexadigit
        code -= 0x0030;                     // Convert hex digit to binary number
        if (code > 15)
            break;                          // Not a hexadigit
        n += code << j;					    // Shift left & add in binary hex
        i -= cchCh;
        cchChPrev = cchCh;
    }
    if (n < 16 && cchChPrev == 2)
        n = 0;                              // Set up converting single 𝑎...𝑓 to hex
    return [n, i];
}

function closeFormatModeList() {
    var x = document.getElementById("formatmode-list");

    if (x != undefined)
        x.remove();
}

function setFormatMode(value, list) {
    if(list == 1)
        ummlConfig.doubleStruckMode = value;
    else
        ummlConfig.transposeChar = value;

    Array.from(document.getElementsByClassName('formatmode-active')).map(t => t.classList.remove('formatmode-active'));
    document.getElementById(value).parentNode.classList.add('formatmode-active');
}

function getSubSupDigit(str, i, delim) {
    // Return e.g., '²' for '^2 ' (str[i-1] = '^', str[i] = '2', delim = ' ')
    var ch = str[i];
    var op = str[i - 1];

    if (!'_^'.includes(op) || !'+-=/ )]}'.includes(delim) || !/[0-9]/.test(ch))
        return '';

    // If the preceding op is the other subsup op, return '', e.g., for a_0^2
    var opSupSub = op == '^' ? '_' : '^';

    for (var j = i - 2; j >= 0; j--) {
        if (str[j] == opSupSub)
            return '';
        if (str[j] < '\u3017' && !isAsciiAlphanumeric(str[j]) && !isDoubleStruck(str[j]))
            break;                          // Could allow other letters...
    }
    if (j == i - 2)
        return '';                          // No base character(s)

    return (op == '^') ? digitSuperscripts[ch] : digitSubscripts[ch];
}

///////////////////////////////
// UNICODEMATH INPUT EDITING //
///////////////////////////////

function opAutocorrect(ip, delim) {
    // Perform operator autocorrections like '+-' → '±' and '/=' → ≠
    let i = ip - 2;

    if (input.value[i] == '"')
        return false;

    if (input.value[i] == '/' && delim in negs) {
        // Convert /<op> to negated op, e.g., /= to ≠
        input.value = input.value.substring(0, i) + negs[delim] + input.value.substring(ip);
        input.selectionStart = input.selectionEnd = ip - 1;
        return false;
    }

    if (ip > 4) {
        // Convert span of math-italic characters to ASCII and check for
        // function name
        var fn = "";
        while (i > 0) {
            var code = codeAt(input.value, i);
            var ch = foldMathItalic(code);
            if (!ch) break;
            fn = ch + fn;
            i -= code > 0xFFFF ? 2 : 1;
        }
        if (isFunctionName(fn) || delim == '\u2061') {
            i++;                    // Move to start of span
            input.value = input.value.substring(0, i) + fn + input.value.substring(ip - 1);
            input.selectionStart = input.selectionEnd = i + fn.length + 1;
            return false;
        }
    }
    if (input.value.substring(ip - 2, ip) in mappedPair) {
        input.value = input.value.substring(0, ip - 2)
            + mappedPair[input.value.substring(ip - 2, ip)] + input.value.substring(ip);
        input.selectionStart = input.selectionEnd = ip - 1;
        return false;
    }

    if (ip >= 4) {                          // E.g., replace "𝑎^2+" by "𝑎²+"
        var ch = getSubSupDigit(input.value, ip - 2, delim);
        if (ch) {
            var j = (delim == ' ') ? ip : ip - 1;
            input.value = input.value.substring(0, ip - 3) + ch + input.value.substring(j);
            input.selectionStart = input.selectionEnd = j;
            return false;
        }
    }
    if (delim in mappedSingle) {
        // Convert ASCII - and ' to Unicode minus (2212) and prime (2032)
        input.value = input.value.substring(0, ip - 1) + mappedSingle[delim]
            + input.value.substring(ip);
        input.selectionStart = input.selectionEnd = ip;
        return false;
    }
    if (ip >= 4 && ' +-='.includes(delim) && input.value[ip - 3] == '/' &&
        (ip == 4 || !isAlphanumeric(input.value[ip - 5]))) {
        // Convert linear numeric fraction to Unicode fraction, e.g., 1/3 to ⅓
        let chNum = input.value[ip - 4];
        let chDenom = input.value[ip - 2];

        if (isAsciiDigit(chNum) && isAsciiDigit(chDenom)) {
            let ch = getUnicodeFraction(chNum, chDenom);
            if (ch && ch.length == 1) {
                let iRem = (delim == ' ') ? ip : ip - 1;
                input.value = input.value.substring(0, ip - 4) + ch + input.value.substring(iRem);
                ip = (delim == ' ') ? ip - 3 : ip - 2
                input.selectionStart = input.selectionEnd = ip
            }
        }
    }
    return false;
}

input.addEventListener("keydown", function (e) {
    var x = document.getElementById(this.id + "autocomplete-list")
    if (handleAutocompleteKeys(x, e))
        return

    // Target is input. For undo, save the selection before it changes
    if (inputUndoStack.length && (!e.ctrlKey || e.key != 'z')) {
        let undoTop = stackTop(inputUndoStack)
        undoTop.selEnd = input.selectionEnd
        undoTop.selStart = input.selectionStart
    }
    if (e.altKey) {
        if (e.key == 'x') {                 // Alt+x: toggle between char code
            e.preventDefault()              //  and char
            let cchSel = input.selectionEnd - input.selectionStart
            let [ch, cchDel] = hexToUnicode(input.value, input.selectionEnd, cchSel)
            let offsetStart = input.selectionEnd - cchDel
            input.value = input.value.substring(0, offsetStart) + ch +
                input.value.substring(input.selectionEnd)
            input.selectionStart = input.selectionEnd = offsetStart + ch.length
        }
        return
    }
    if (e.ctrlKey) {
        switch (e.key) {
            case 'b':                       // Ctrl+b
            case 'i':                       // Ctrl+i
                // Toggle math bold/italic
                e.preventDefault()
                let chars = getInputSelection()
                if (chars[0] == '"' && chars[chars.length - 1] == '"')
                    chars = chars.substring(1, chars.length - 1)
                chars = boldItalicToggle(chars, e.key)
                if (chars.length == 1 && (isAsciiAlphabetic(chars) || isLcGreek(chars)))
                    chars = '"' + chars + '"'
                insertAtCursorPos(chars)
                input.selectionStart -= chars.length
                return

            case 's':                       // Ctrl+s
                // Set output selection according to selection attributes
                e.preventDefault()
                let sel = window.getSelection()
                let selanchor, selfocus
                let node, nodeAnchor, nodeFocus
                let walker = document.createTreeWalker(output.firstElementChild, NodeFilter.SHOW_ELEMENT, null)

                for (node = walker.currentNode; node; node = walker.nextNode()) {
                    if (!selanchor) {
                        selanchor = node.getAttribute('selanchor')
                        if (selanchor)
                            nodeAnchor = node
                    }
                    if (!selfocus) {
                        selfocus = node.getAttribute('selfocus')
                        if (selfocus)
                            nodeFocus = node
                    }
                }
                if (!selanchor)
                    return
                if (!selfocus) {
                    selfocus = selanchor
                    nodeFocus = nodeAnchor
                }
                if (selanchor[0] == '-')    // Should switch to #text node...
                    selanchor = selanchor.substring(1)
                if (selfocus[0] == '-')
                    selfocus = selfocus.substring(1)
                sel.setBaseAndExtent(nodeAnchor, selanchor, nodeFocus, selfocus)
                checkMathSelection(sel)
                return

            case 'y':                       // Ctrl+y
                // Redo
                e.preventDefault()
                if (!inputRedoStack.length)
                    return

                inputUndoStack.push({
                    uMath: input.value, selStart: input.selectionStart,
                    selEnd: input.selectionEnd
                })

                let redoTop = inputRedoStack.pop()
                input.value = redoTop.uMath
                if (redoTop.selStart != undefined) {
                    input.selectionStart = redoTop.selStart
                    input.selectionEnd = redoTop.selEnd
                }
                draw(true)
                return

            case 'z':                       // Ctrl+z
                // Undo
                e.preventDefault()
                if (!inputUndoStack.length)
                    return
                let undoTop = inputUndoStack.pop()
                if (input.value == undoTop.uMath) {
                    if (!inputUndoStack.length)
                        return
                    undoTop = inputUndoStack.pop()
                }
                let redoNext = {
                    uMath: input.value, selStart: input.selectionStart,
                    selEnd: input.selectionEnd
                }
                inputRedoStack.push(redoNext)
                input.value = undoTop.uMath
                if (undoTop.selStart != undefined) {
                    input.selectionStart = undoTop.selStart
                    input.selectionEnd = undoTop.selEnd
                }
                draw(true)
                return
        }
    }
    if (e.shiftKey && e.key == 'Enter') {   // Shift+Enter
        //e.preventDefault()
        //insertAtCursorPos('\u200B')       // Want VT for math paragraph
    }
    if (e.key == 'F1') {
        e.preventDefault()
        document.getElementById("help").click()
        return
    }
    if (demoID) {
        var demoEq = document.getElementById('demos')
        switch (e.key) {
            case 'ArrowRight':
                nextEq()
                return
            case 'ArrowLeft':
                prevEq()
                return
            case 'Escape':
                // Turn off demo mode
                endDemo()
                return
            case ' ':
                // Toggle pause
                e.preventDefault()
                if (demoPause) {
                    demoID = 0         // Needed to start (instead of end)
                    startDemo()
                } else {
                    demoPause = true
                    clearInterval(demoID)
                    demoEq.style.backgroundColor = 'green'
                }
                return
        }
    }
})

// insert one or multiple characters at the current cursor position of
// the input field or, if there is no cursor, append them to its value,
// via https://stackoverflow.com/a/11077016
function insertAtCursorPos(symbols) {
    let sel = document.getSelection()       // Check if in output window
    let node = sel.anchorNode
    if (node) {
        if (node.nodeName == '#text')
            node = node.parentElement
        if (node.nodeName[0] == 'm') {
            // Insert into output window
            const event = new Event('keydown')
            event.key = symbols
            output.dispatchEvent(event)
            return
        }
    }
    if (input.selectionStart || input.selectionStart == '0') {
        var startPos = input.selectionStart;
        var endPos = input.selectionEnd;
        input.value = input.value.substring(0, startPos)
            + symbols
            + input.value.substring(endPos, input.value.length);
        input.selectionEnd = input.selectionStart = startPos + symbols.length;
    } else {
        input.value += symbols;
    }
    input.focus();
    draw();
}

function autocomplete() {
    // Try autocorrecting or autocompleting a control word when user
    // modifies UnicodeMath in input window
    input.addEventListener("input", function (e) {
        var ip = input.selectionStart;      // Insertion point

        if (e.inputType != "insertText" && e.inputType != "deleteContentBackward" ||
            !ip || ip != input.selectionEnd) {
            return false;
        }
        closeAutocompleteList();

        var delim = input.value[ip - 1];    // Last char entered
        var i = ip - 2;
        var oddQuote = delim == '"';
        var iQuote = 0;

        // Check if ip is inside a quoted literal
        for (var iOff = 0; ; iOff = iQuote + 1) {
            iQuote = input.value.indexOf('"', iOff);
            if (iQuote == -1 || iQuote >= ip - 1)
                break;                      // No more quotes before ip
            oddQuote = !oddQuote;
        }
        if (oddQuote) {                     // Inside quoted literal
            if (delim == '"') {             // Insert matching quote
                input.value = input.value.substring(0, ip - 1) + '"' + input.value.substring(ip - 1);
                input.selectionStart = input.selectionEnd = ip;
            }
            return false;
        }
        if (delim == '"' && input.value.length > ip && input.value[ip] == '"') {
            // Instead of inserting a quote at ip - 1 when a closing quote is at
            // ip, move past the closing quote (same as with program editors).
            input.value = input.value.substring(0, ip - 1) + input.value.substring(ip);
            input.selectionStart = input.selectionEnd = ip;
            return false;
        }

        // Move back alphanumeric span
        while (i > 0 && /[a-zA-Z0-9]/.test(input.value[i])) { i--; }

        if (input.value[i] == 'ⓐ')
            return false;                   // \arg: leave as is

        if (i < 0 || input.value[i] != '\\' &&
            (!i || !isMathColor(input.value.substring(i - 1, i + 1)))) {
            // Not control word; check for italicization & operator autocorrect
            var ch = italicizeCharacter(delim);
            if (ch != delim) {
                // Change ASCII or lower-case Greek letter to math-italic letter
                input.value = input.value.substring(0, ip - 1) + ch + input.value.substring(ip);
                if (ch.length > 1) { ip++; } // Bypass trail surrogate
                input.selectionStart = input.selectionEnd = ip;
                return false;
            }
            return opAutocorrect(ip, delim);
        }
        if (ip <= 2)
            return false;                   // Autocorrect needs > 1 letter

        if (!/[a-zA-Z0-9]/.test(delim)) {
            // Delimiter entered: try to autocorrect control word
            var symbol = resolveCW(input.value.substring(i, ip - 1));
            var cch = symbol.length;
            if (symbol[0] != '\"' || cch == 3) {
                // Control word found: replace it with its symbol and update
                // the input selection
                if (delim == " ") {
                    delim = "";
                }
                if (cch < 3) {
                    symbol = italicizeCharacter(symbol);
                    cch = symbol.length;
                }
                input.value = input.value.substring(0, i) + symbol + delim
                    + input.value.substring(ip);
                input.selectionStart = input.selectionEnd = i + cch + (delim ? 1 : 0);
                speak(symbol)
            }
            return
        }
        if (ip - i < 3)
            return

        let cw = input.value.substring(i + 1, ip);  // Partial control word
        let autocl = createAutoCompleteMenu(cw, this.id, (e) => {
            // User clicked matching control word: insert its symbol
            let val = e.currentTarget.innerText;
            let ch = italicizeCharacter(val[val.length - 1]);
            let code = ch.codePointAt(0);

            input.value = input.value.substring(0, i) + ch + input.value.substring(ip);
            speak(ch)
            ip = i + (code > 0xFFFF ? 2 : 1);
            input.selectionStart = input.selectionEnd = ip;
            if (code >= 0x2061 && code <= 0x2C00)
                opAutocorrect(ip, ch);
            closeAutocompleteList();
        })

        // Append div element as a child of the input autocomplete container
        if (autocl)
            this.parentNode.appendChild(autocl);
    })
}


////////////////////////////
// AUTOCOMPLETE FUNCTIONS //
////////////////////////////

// Symbols whose autocomplete options should be selected by default
var commonSymbols = "αβδζθλχϕϵ⁡←∂√∞⒨■"; // 03B1 03B2 03B4 03B6 03B8 03BB 03C7 03D5 03F5 2061 2190 2202 221A 221E 24A8 25A0
var currentFocus = -1;

function closeAutocompleteList() {
    let x = document.getElementsByClassName("autocomplete-items")
    if (x != undefined) {
        let cItem = x.length

        for (var i = 0; i < cItem; i++) {
            x[i].parentNode.removeChild(x[i])
        }
    }
    closeContextMenu()
}

function createAutoCompleteMenu(cw, id, onAutoCompleteClick) {
    // Create an autocomplete menu of control-words that partially match cw.
    // Called for both input-window and output-window editing
    let matches = getPartialMatches(cw);
    if (!matches.length)
        return;

    // Create a <div> element to contain matching control words
    currentFocus = -1;
    let cwOption
    let autocl = document.createElement("div");
    autocl.setAttribute("id", id + "autocomplete-list");
    autocl.setAttribute("class", "autocomplete-items");

    // Create a div element for each matching control word
    for (let j = 0; j < matches.length; j++) {
        let b = document.createElement("div");
        cwOption = matches[j]

        // Bold the matching letters and insert an input field to hold
        // the current control word and symbol
        b.innerHTML = "<strong>" + cwOption.substring(0, cw.length) + "</strong>";
        b.innerHTML += matches[j].substring(cw.length);
        b.innerHTML += "<input type='hidden' value='" + cwOption + "'>";

        if (commonSymbols.includes(cwOption[cwOption.length - 1])) {
            // Activate option for most common symbol, e.g., for '\be'
            // highlight '\beta β'
            currentFocus = j;
            b.classList.add("autocomplete-active");
        }
        // Add click function for user click on a control word
        b.addEventListener("click", onAutoCompleteClick);
        autocl.appendChild(b);
    }
    if (currentFocus == -1) {
        // No common control-word option identified: highlight first option
        currentFocus = 0;
        autocl.firstChild.classList.add("autocomplete-active");
    }
    cwOption = matches[currentFocus]
    speak(cwOption[cwOption.length - 1])
    return autocl
}

function handleAutocompleteKeys(x, e) {
    // Callback to handle autocomplete drop-down input. Called for both
    // input-window and output-window editing
    if (!x)                             // Empty autocomplete list
        return false;                   // Signal didn't handle keydown

    x = x.getElementsByTagName("div");  // x = autocomplete entries

    switch (e.key) {
        case "ArrowDown":
            // Increase currentFocus & highlight corresponding control-word
            e.preventDefault();
            currentFocus++;
            addActive(x);
            return true;

        case "ArrowUp":
            // Decrease currentFocus & highlight corresponding control-word
            e.preventDefault();
            currentFocus--;
            addActive(x);
            return true;

        case 'Escape':
            closeAutocompleteList()
            return true

        case "Enter":
        case "Tab":
            // Simulate a click on the "active" control-word option
            if (currentFocus >= 0 && x)
                x[currentFocus].click();
            if (e.key != '\\') {
                e.preventDefault();
                return true
            }                               // Return false to input backslash
    }
    return false
}

function addActive(x) {
    if (!x) return false;

    // Classify an option as "active". First, remove "autocomplete-active"
    // class from all options, and ensure the currentFocus is valid
    removeActive(x);
    if (currentFocus >= x.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = (x.length - 1);

    // Add class "autocomplete-active" to x[currentFocus]
    console.log("x[" + currentFocus + "] = " + x[currentFocus].innerText);
    x[currentFocus].classList.add("autocomplete-active");
    let cwOption = x[currentFocus].innerText
    speak(cwOption[cwOption.length - 1])
}

function removeActive(x) {
    // Remove "autocomplete-active" class from all autocomplete options
    for (var i = 0; i < x.length; i++) {
        x[i].classList.remove("autocomplete-active");
    }
}

///////////////////////////////////
// OUTPUT EDITING AND NAVIGATION //
///////////////////////////////////

function speechSel(sel) {
    if (output.firstElementChild.nodeName == 'MJX-CONTAINER')
        return                              // MathJax

    let node = sel.anchorNode;

    if (node.nodeType != 3) {
        let name = node.nodeName
        if (names[name])
            name = names[name];
        speak(name)
        return
    }
    if (node.length == sel.anchorOffset) {
        handleEndOfTextNode(node.parentElement)
        return
    }

    let ch = node.data;
    let intent = getIntent(node.parentElement);
    if (isDoubleStruck(intent))
        speak(intent)
    else if (ch[0] >= '\uD835' || sel.anchorNode.length == 1)
        speak(ch)
    else
        speak(ch[sel.anchorOffset])
}

function getTableRowName(node) {
    let name = 'row'
    let intent = node.parentElement.getAttribute('intent')

    if (intent == ':equations') {
        intent = node.parentElement.parentElement.getAttribute('intent')
        name = intent == ':cases' ? 'case' : 'equation'
    }
    return name
}

function getName(node) {
    let name = names[node.nodeName]
    return name ? name : resolveSymbols(node.textContent)
}

function checkTable(node) {
    // On entry, node is an <mtr>. Speak the kind of table row and return
    // the row's first element child
    let unit = 'row'
    let intent = node.parentElement.getAttribute('intent')

    if (intent == ':equations') {
        intent = node.parentElement.parentElement.getAttribute('intent')
        unit = intent == ':cases' ? 'case' : 'equation'
    }
    speak('next ' + unit)
    return node.firstElementChild
}

function getNaryOp(node) {
    // If the first child of mrow is a msubsup or munderover with an N-ary
    // op for its first child, return the N-ary op; else return ''
    if (node.nodeName != 'mrow')
        return '';
    node = node.firstElementChild;
    if (node.nodeName != 'msubsup' && node.nodeName != 'munderover')
        return '';
    node = node.firstElementChild;
    if (node.nodeName != 'mo')
        return '';
    let ch = node.textContent;
    return isNary(ch) ? ch : ''
}

function getIntent(node) {
    return node.getAttribute('intent')
}

function checkSimpleSup(node) {
    if (node.nodeName == 'msup' || node.nodeName == 'msqrt') {
        let s = speech(node)
        if (s.length <= 3) {
            speak(resolveSymbols(s))
            return true
        }
    }
    return false
}

const names = {
    'math': 'math', 'mfrac': 'fraction', 'mover': 'modify above',
    'msub': 'subscript', 'msubsup': 'subsoup', 'msup': 'superscript',
    'msqrt': 'square root', 'mtable': 'matrix', 'mtd': 'element',
    'munder': 'modify below', 'munderover': 'below above',
}

function refreshDisplays(uMath, noUndo) {
    // Update MathML, UnicodeMath, and code-point displays; push current content
    // onto output undo stack; restore selection from selanchor and selfocus
    let uMathCurrent = getUnicodeMath(output.firstElementChild, true)
    if (!testing)
        output_source.innerHTML = highlightMathML(escapeMathMLSpecialChars(indentMathML(output.innerHTML)))

    if (!noUndo) {
        if (!uMath)
            uMath = uMathCurrent
        let undoTop = stackTop(outputUndoStack)
        if (uMath != undoTop) {
            outputUndoStack.push(uMath)
            if (!testing)
                console.log("Push " + uMath)
        }
    }

    input.innerHTML = removeSelMarkers(uMathCurrent)
    if (!testing)
        codepoints.innerHTML = getCodePoints()

    let node = output.firstElementChild     // <math> node
    if (!node)                              // No <math> node
        return

    if (node.firstElementChild.nodeName == 'mi' && node.textContent == '⬚') {
        setSelection(null, node.firstElementChild, SELECTNODE)
        return
    }

    // Restore selection if previous code set the selection attributes
    // selanchor and selfocus appropriately
    let nodeA, nodeF                        // Anchor, focus nodes
    let offsetA, offsetF                    // Anchor, focus offsets
    let walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, null)

    while (!offsetA || !offsetF) {
        node = walker.currentNode
        if (!offsetA) {
            offsetA = node.getAttribute('selanchor')
            if (offsetA) {
                nodeA = node
                if (offsetA[0] == '-') {    // Move to #text child
                    offsetA = offsetA.substring(1)
                    nodeA = node.firstChild
                }
            }
        }
        if (!offsetF) {
            offsetF = node.getAttribute('selfocus')
            if (offsetF) {
                nodeF = node
                if (offsetF[0] == '-') {    // Move to #text child
                    offsetF = offsetF.substring(1)
                    nodeF = node.firstChild
                }
            }
        }
        if (!walker.nextNode())
            break
    }
    if (!nodeA)
        return                              // No selection attributes

    if (!nodeF) {                           // No 'selfocus': insertion point (IP)
        nodeF = nodeA
        offsetF = offsetA
    }

    let sel = window.getSelection()

    if (nodeA.textContent == '⬚') {
        setSelection(sel, nodeA, SELECTNODE)
    } else if (nodeA === nodeF && offsetA == offsetF) {
        if (nodeA.nodeName == '#text' && offsetA == nodeA.textContent.length ||
            !nodeA.childElementCount && offsetA == '1' ||
            offsetA && nodeA.childElementCount == offsetA) {
                atEnd = true
        }
        setSelection(sel, nodeA, offsetA)
    } else {
        if (nodeF.childElementCount && offsetF > nodeF.childElementCount)
            offsetF = nodeF.childElementCount
        sel.setBaseAndExtent(nodeA, offsetA, nodeF, offsetF)
    }
}

function checkNaryand(node, intent) {
    let arg = node.getAttribute('arg')
    if (arg != 'naryand')
        return ''

    let name = 'n aryand'
    if (intent) {
        if (intent.indexOf('integral') != -1)
            name = 'int-agrand' // Convince speech to say integrand
        else if (intent.indexOf('sum') != -1)
            name = 'summand'
    }
    return name
}

function checkFunction(node) {
    let cNode = node.childElementCount
    let i = cNode - 1
    let fn = ''

    for (; i >= 0 && node.children[i].nodeName == 'mi'; i--) {
        fn = node.children[i].textContent + fn
    }
    fn = foldMathItalics(fn)
    if (!isFunctionName(fn))
        return false
    node.children[i + 1].textContent = fn
    i += 2
    for (cNode = cNode - i; cNode > 0; cNode--)
        node.children[i].remove()           // Remove trailing <mi>'s
    return true
}

function removeSelAttributes(node) {
    if (!node) {
        node = output.firstElementChild
        if (!node)
            return
    }
    let walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, null)

    for (; node; node = walker.nextNode()) { // Remove current selection attributes
        node.removeAttribute('selanchor')
        node.removeAttribute('selfocus')
    }
}

function indexEndOfValue(str, i) {
    let cQuote = 0
    for (; i < str.length; i++) {
        if (str[i] == '"') {
            cQuote++
            if (cQuote == 2)
                return i + 1
        }
    }
    return -1
}

function removeMathMlSelAttributes(mathml) {
    let i = mathml.indexOf('selanchor')
    if (i == -1)
        return mathml

    let j = indexEndOfValue(mathml, i + 10)
    if (j == -1)
        return mathml

    let mml = mathml.substring(0, i - 1) + mathml.substring(j)
    i = mml.indexOf('selfocus', i)
    if (i == -1)
        return mml

    j = indexEndOfValue(mml, i)
    if (j == -1)
        return mml
    return mml.substring(0, i - 1) + mml.substring(j)
}

function handleEndOfTextNode(node) {
    let name = node.parentElement.nodeName
    let nameT = ''

    if (name == 'mrow') {
        let nodeNext = node.nextElementSibling
        let intent = getIntent(node);
        node = node.parentElement;
        name = node.parentElement.nodeName
        if (intent == ':function')
            name = 'function';
        else if (intent.indexOf('integral') != -1)
            name = 'integrand';
        else if (isMathMLObject(node.parentElement))
            nameT = getArgName(node)
        else if (nodeNext) {
            name = isMathMLObject(nodeNext) ? names[nodeNext.nodeName] : nodeNext.textContent
            speak(name)
            return nodeNext
        }
    } else {
        nameT = getArgName(node)
    }
    if (nameT)
        name = nameT
    if (names[name])
        name = names[name];

    if (name != 'mrow') {
        speak('end of ' + name);
        atEnd = true;
    }
    return node
}

function insertNode(node, offset, nodeNew, nodeP) {
    if (node.textContent == '⬚') {
        // Replace empty arg place holder symbol with key
        nodeP.replaceChild(nodeNew, node)
        return
    }
    if (offset && offset == node.childElementCount &&
          (node.nodeName != 'mrow' || !node.hasAttribute('intent'))) {
        if (node.nextElementSibling) {
            nodeP.insertBefore(nodeNew, node.nextElementSibling)
            return
        }
        if (isMrowLike(nodeP)) {
            nodeP.appendChild(nodeNew)
            return
        }
        if (node.nodeName == 'mrow') {
            node.appendChild(nodeNew)
            return
        }
    }
    if (isMrowLike(node) &&
          (node.nodeName != 'mrow' || !node.hasAttribute('intent'))) {
        node.insertBefore(nodeNew, node.children[offset])
        return
    }
    if (!offset && node.nodeType == 1) {
        nodeP.insertBefore(nodeNew, node)
    } else if (isMrowLike(nodeP)) {
        if (atEnd && offset) {
            if (node.nextElementSibling) {
                nodeP.insertBefore(nodeNew, node.nextElementSibling)
            } else {
                if (!node.textContent)
                    nodeP.replaceChild(nodeNew, node)
                else
                    nodeP.appendChild(nodeNew)
            }
        } else {
            nodeP.insertBefore(nodeNew, node)
        }
    } else {
        let nodeMrow = document.createElement('mrow')
        nodeP.insertBefore(nodeMrow, node)
        if (atEnd) {
            nodeMrow.appendChild(node)
            nodeMrow.appendChild(nodeNew)
        } else {
            nodeMrow.appendChild(nodeNew)
            nodeMrow.appendChild(node)
        }
        atEnd = false;
    }
}

function handleKeyboardInput(node, key, sel) {
    // Handle keyboard input into output window
    closeAutocompleteList()
    if (deleteSelection()) {
        sel = window.getSelection()
        node = sel.anchorNode
    }
    if (key == '#') {
        // Create equation number table if child of <math> is <mi>, <mn>,
        // <mo>, or <mtext>
        let nodeT = output.firstElementChild.firstElementChild
        let createEqNo = !nodeT.childElementCount

        if (!createEqNo && nodeT.nodeName == 'mrow') {
            // Or create eqno table for <mrow> without unmatched parens
            let [cParen, k, opBuildUp] =
                checkBrackets(output.firstElementChild.firstElementChild)
            createEqNo = !cParen
        }
        if (createEqNo) {
            // Create equation number table with first mtd containing <mtext>
            // with place holder and second mtd containing current MathML
            removeSelAttributes()
            let html = `<mtable><mlabeledtr><mtd><mtext selanchor="0" selfocus="1">⬚</mtext></mtd><mtd>` +
                output.firstElementChild.innerHTML +
                `</mtd></mlabeledtr></mtable>`
            output.firstElementChild.innerHTML = html
            refreshDisplays()
            return
        }
    }
    let nodeNewName = getMmlTag(key)

    if (node.nodeName == 'math') {
        removeSelAttributes(node)
        if (!sel.anchorOffset) {
            let nodeNew = document.createElement(nodeNewName)
            nodeNew.textContent = key
            setSelAttributes(nodeNew, 'selanchor', '1')
            node.insertBefore(nodeNew, node.firstElementChild)
            refreshDisplays()
            return
        }
        if(!testing)
            console.log('Input at end of math zone')
        let nodeNew = document.createElement(nodeNewName)
        nodeNew.textContent = key
        setSelAttributes(nodeNew, 'selanchor', '1')
        node.appendChild(nodeNew)
        refreshDisplays()
        return
    }
    removeSelAttributes()
    let autocl
    if (node.nodeName == '#text')
        node = node.parentElement
    let nodeName = node.nodeName.toLowerCase()
    let nodeP = node.parentElement

    if (isAsciiAlphabetic(key) && node.textContent.endsWith('\\')) {
        let nodeNew = document.createElement('mtext')
        nodeNew.innerHTML = node.textContent + key
        setSelAttributes(nodeNew, 'selanchor', '-' + nodeNew.textContent.length)
        nodeP.replaceChild(nodeNew, node)
        nodeP.innerHTML = nodeP.innerHTML
        refreshDisplays()
        return
    }

    if (nodeName == 'mtext' && nodeP.nodeName == 'mtd' &&
        nodeP.parentElement.nodeName == 'mlabeledtr') {
        // Entering an equation number
        if (node.textContent == '⬚')
            node.textContent = key
        else
            node.textContent += key
        setSelAttributes(node, 'selanchor', '-' + node.textContent.length)
        refreshDisplays()
        return
    }
    if (nodeName == 'mtext' && node.textContent[0] == '"') {
        if (key == '"')
            node.textContent = node.textContent.substring(1)
        else
            node.textContent += key
        setSelAttributes(node, 'selanchor', '-' + node.textContent.length)
        refreshDisplays()
        return
    }
    let offset = sel.anchorOffset

    if (nodeName == 'mtext' && node.textContent[0] == '\\') {
        // Collect control word; offer autocompletion menu
        if (isAsciiAlphabetic(key)) {
            node.textContent += key         // Collect control word
            autocl = checkAutocomplete(node)
            let offset = '-' + node.textContent.length
            setSelAttributes(node, 'selanchor', offset)
            nodeP.innerHTML = nodeP.innerHTML // Force redraw
            refreshDisplays()
            speak(resolveSymbols(key))
            return autocl
        }
        let symbol = resolveCW(node.textContent)
        if (symbol[0] == '"')
            return
        nodeName = getMmlTag(symbol)
        let nodeNew = document.createElement(nodeName)
        if (isDoubleStruck(symbol)) {
            let ch = doublestruckChar(symbol)
            nodeNew.setAttribute('intent', symbol)
            symbol = ch
        }
        nodeNew.textContent = symbol
        setSelAttributes(nodeNew, 'selanchor', '1')
        nodeP.replaceChild(nodeNew, node)
        node = nodeNew
        if (key == ' ') {
            nodeNewName = ''                // Eat ' '
            key = symbol                    // Set up to speak symbol
            offset = -1                     // - → + in setSelAttributes()
        }
    }
    let isFunction

    switch (nodeNewName) {
        case 'mi':
            if (nodeName == 'mi' && nodeP.attributes.intent &&
                nodeP.attributes.intent.nodeValue == ':function') {
                node.textContent = node.textContent.substring(0, offset) +
                    key + node.textContent.substring(offset)
                nodeNewName = ''            // No new node
                offset++
            }
            break
        case 'mn':
            if (nodeName == 'mn') {
                node.textContent = node.textContent.substring(0, offset) +
                    key + node.textContent.substring(offset)
                nodeNewName = ''            // No new node
                offset++
            }
            break
        case 'mo':
            if (nodeName == 'mi' && isMrowLike(nodeP)) {
                isFunction = checkFunction(nodeP)
            } else if (nodeName == 'mrow' && node.lastElementChild) {
                if (node.lastElementChild.nodeName == 'mi') {
                    isFunction = checkFunction(node)
                } else if (node.lastElementChild.nodeName == 'mrow') {
                    let nodeT = node.lastElementChild
                    if (nodeT.nodeName == 'mrow' && nodeT.lastElementChild &&
                        nodeT.lastElementChild.nodeName == 'mrow') {
                        nodeT = nodeT.lastElementChild
                    }
                    if (!nodeT.attributes.intent)
                        isFunction = checkFunction(nodeT)
                }
            }
            if (isFunction) {
                if (key == ' ')
                    key = '\u2061'
                break
            }
            if (node.textContent == '/' && key in negs) {
                node.textContent = key = negs[key]
                nodeNewName = ''
            } else if (node.textContent + key in mappedPair) {
                node.textContent = key = mappedPair[node.textContent + key]
                nodeNewName = ''
            } else if (key in mappedSingle) {
                key = mappedSingle[key]
            } else if (key == ' ')
                key = '\u202F'          // Use NNBSP to maintain ' ' in mml
            break
    }
    speak(resolveSymbols(key))
    if (!nodeNewName) {
        // node textContent modified; no new node
        setSelAttributes(node, 'selanchor', -offset)
        nodeP.innerHTML = nodeP.innerHTML // Force redraw
        refreshDisplays();
        return
    }
    let nodeNew = document.createElement(nodeNewName)
    removeSelAttributes(nodeP)
    if (isDoubleStruck(key)) {
        let ch = doublestruckChar(key)
        nodeNew.setAttribute('intent', key)
        key = ch
    }
    nodeNew.textContent = key
    setSelAttributes(nodeNew, 'selanchor', '1')
    insertNode(node, offset, nodeNew, nodeP)
    nodeP.innerHTML = nodeP.innerHTML   // Force redraw
    refreshDisplays();
    return autocl
}

function getMmlTag(ch) {
    if (ch < ' ')
        return ''
    if (isAsciiDigit(ch))
        return 'mn'
    if (isAsciiAlphabetic(ch) || isGreek(ch) || ch > '\u3017' || isDoubleStruck(ch))
        return 'mi'
    if (ch == '"')
        return 'mtext'
    return 'mo'
}

function setAnchorAndFocus(sel, nodeAnchor, offsetAnchor, nodeFocus, offsetFocus) {
    if (!testing) {
        console.log("anchor, focus = " +
            nodeAnchor.nodeName + ', ' + offsetAnchor + ', ' +
            nodeFocus.nodeName + ', ' + offsetFocus)
    }
    sel.setBaseAndExtent(nodeAnchor, offsetAnchor, nodeFocus, offsetFocus)
}

function checkMathSelection(sel) {
    // Ensure selection in output window is valid for math, e.g., select whole
    // math object if selection boundary points are in different children
    let nodeAnchor = sel.anchorNode
    if (!nodeAnchor)
        return null

    if (nodeAnchor.nodeName == 'DIV') {
        if (nodeAnchor.id != 'output')
            return null

        // Empty DIV: insert math zone with place holder
        nodeAnchor.innerHTML = `<math display='block'><mi selanchor="0" selfocus="1">⬚</mi></math>`
        return setSelection(sel, nodeAnchor, SELECTNODE)
    }
    let node = sel.focusNode
    let offset = sel.focusOffset

    if (node.nodeName == '#text')
        node = node.parentElement
    if (node.nodeName[0] != 'm')
        return null                         // Not MathML ⇒ not output window

    let selanchor = node.getAttribute('selanchor')
    if (selanchor && sel.isCollapsed) {
        let nodeT = node
        if (selanchor[0] == '-') {
            selanchor = selanchor[1]
            nodeT = node.firstChild
        }
        if (selanchor == sel.anchorOffset && node == sel.anchorNode)
            return sel                      // Already set
    }
    let name = ''
    if(!testing)
        console.log('node, offset = ' + node.nodeName + ', ' + offset)

    if (node.childElementCount) {
        if (node.nodeName == 'mrow') {
            let intent = node.getAttribute('intent')
            if (intent) {
                if (intent == ':function')
                    name = 'function'
                else if (intent.startsWith('binomial-coefficient'))
                    name = 'binomial-coefficient'
                else if (intent == ':fenced')
                    name = 'fenced'
            } else if (node.nextElementSibling) {
                node = node.nextElementSibling
                setSelection(sel, node, 0)
                name = node.childElementCount
                    ? names[node.nodeName] : node.textContent
            } else if (node.parentElement.nodeName == 'math') {
                name = 'math'
            }
        } else {
            if (offset || !checkSimpleSup(node) && node.nodeName != 'mtd')
                name = names[node.nodeName]
        }
        if (name && offset == node.childElementCount)
            name = 'end of ' + name
    } else {
        if (sel.focusNode.nodeName == '#text') {
            if (offset == sel.focusNode.textContent.length) {
                if (isMrowLike(node.parentElement)) {
                    if (node.nextElementSibling) {
                        // Remove extra stop between childless-element siblings
                        if (keydownLast == 'ArrowRight')
                            node = node.nextElementSibling
                        else if (node.textContent.length > getCh(node.textContent, 0).length)
                            return sel
                        if (node.nodeName == 'mrow')
                            node = node.firstElementChild
                        if (offset != sel.anchorOffset) // Nondegenerate selection
                            setAnchorAndFocus(sel, sel.anchorNode, sel.anchorOffset, node, 0)
                        else
                            setAnchorAndFocus(sel, node, 0, node, 0)
                        if (node.childElementCount) {
                            name = names[node.nodeName]
                        } else {
                            name = getCh(node.textContent, 0)
                            let intent = node.getAttribute('intent')
                            if (isDoubleStruck(intent))
                                name = intent
                        }
                    } else {
                        node = node.parentElement
                        if (isMathMLObject(node.parentElement)) {
                            name = getArgName(node)
                            if (name)
                                name = 'end of ' + name
                        } else if (node.nodeName == 'mtd') {
                            name = '＆'      // → ampersand
                        }
                    }
                } else if (isMathMLObject(node.parentElement)) {
                    name = getArgName(node)
                    if (name)
                        name = 'end of ' + name
                }
            } else {
                name = symbolSpeech(getCh(node.textContent, offset))
            }
        } else if (!offset) {               // Childless element
            // If offset is at end of childless element, speech occurs
            // earlier, e.g., for end of numerator
            let text = node.textContent
            if (text)
                name = symbolSpeech(getCh(text, 0))
        }
    }
    let intent = node.getAttribute('intent')
    if (isDoubleStruck(intent)) {
        name = intent
    } else if (name) {
        if (name == 'matrix')
            name = ''
        else if (name == 'math') {
            if (keydownLast == 'ArrowLeft') {
                name = 'start of ' + name
                node = node.firstElementChild
                if (node.nodeName == 'mrow')
                    node = node.firstElementChild
                name += ', ' + getName(node)
                setSelection(sel, node, 0)
            } else if (offset) {
                name = 'end of ' + name
            }
        }
    }
    if (name)
        speak(name)

    if (sel.isCollapsed)
        return sel                          // All insertion points are valid

    // Nondegenerate selection
    let rel = 1                             // Default that nodeFocus ≠ nodeAnchor
    let nodeFocus = sel.focusNode

    if (nodeAnchor === nodeFocus) {
        if (nodeAnchor.nodeName == '#text') {
            // In a text node and in <mi>, <mn>, <mo>, or <mtext>, all offset
            // combinations are valid
            return sel
        }
        if (isMathMLObject(nodeAnchor)) {
            // Selecting a single child of a MathML object is valid. Selecting
            // more than one child must select the whole object
            return Math.abs(sel.anchorOffset - sel.focusOffset) <= 1
                ? sel : setSelection(sel, nodeAnchor, SELECTNODE)
        }
        rel = 0
    }
    let range = sel.getRangeAt(0)
    let nodeCA = range.commonAncestorContainer
    let needSelChange = false

    if (isMathMLObject(nodeCA)) {
        if (nodeCA.childElementCount > 1) {
            let iChildA = getChildIndex(nodeAnchor, nodeCA)
            let iChildF = getChildIndex(nodeFocus, nodeCA)

            if (iChildA != iChildF) {  // Selection across args: select MML obj
                sel = setSelection(sel, nodeCA, SELECTNODE)
                removeSelAttributes()
                setSelAttributes(nodeCA, 'selanchor', 0, 'selfocus', nodeCA.childElementCount)
                console.log('iChildA = ' + iChildA + ' iChildF = ' + iChildF)
                refreshDisplays('', true)
            }
        }
        return sel
    }
    for (node = nodeAnchor; node != nodeCA; node = node.parentElement) {
        // Walk up to common ancestor checking if MathML objects are present
        if (isMathMLObject(node)) {
            nodeAnchor = node
            needSelChange = true
        }
    }
    if (!rel) {
        nodeFocus = nodeAnchor
    } else {
        for (node = nodeFocus; node != nodeCA; node = node.parentElement) {
            if (isMathMLObject(node) &&
                (node != range.endContainer || range.endOffset)) {
                nodeFocus = node
                needSelChange = true
            }
        }
    }
    if (needSelChange) {
        if (!rel) {                         // nodeAnchor equals nodeFocus
            setAnchorAndFocus(sel, nodeAnchor, 0, nodeAnchor, nodeAnchor.childNodes.length)
        } else {
            // Compute rel = -1, 0, 1 for the focus node precedes, equals, or
            // follows the anchor node, respectively. Note: selection.direction
            // isn't supported by Chromium
            let offset
            range = document.createRange()
            range.selectNode(nodeAnchor)
            rel = range.comparePoint(nodeFocus, 0)
            if(!testing)
                console.log("rel =" + rel)

            if (rel > 0) {                  // nodeFocus follows nodeAnchor 
                offset = nodeFocus.nodeName == '#text'
                    ? nodeFocus.textContent.length : nodeFocus.childNodes.length
                setAnchorAndFocus(sel, nodeAnchor, 0, nodeFocus, offset)
            } else {                        // nodeFocus precedes nodeAnchor
                offset = nodeAnchor.nodeName == '#text'
                       ? nodeAnchor.textContent.length : nodeAnchor.childNodes.length
                setAnchorAndFocus(sel, nodeAnchor, offset, nodeFocus, 0)
            }
        }
    } else if (isMathMLObject(nodeCA) && nodeCA !== nodeAnchor) {
        setAnchorAndFocus(sel, nodeCA, 0, nodeCA, nodeCA.childNodes.length)
    }
    return sel
}

function deleteSelection(range) {
    // Delete nodes selected in range or in user selection
    let sel
    if (!range) {                           // No range: use window selection
        sel = window.getSelection()
        range = sel.getRangeAt(0)
    }
    if (range.collapsed) {
        closeAutocompleteList()
        return false                        // Nothing selected
    }
    let uMath = getUnicodeMath(output.firstElementChild, true)
    let nodeStart = range.startContainer
    let singleArg = nodeStart === range.endContainer

    if (singleArg) {
        let text = nodeStart.textContent
        if (text == '⬚')
            return true                         // Don't delete place holder

        if (nodeStart.nodeName == '#text') {
            removeSelAttributes()
            text = text.substring(0, range.startOffset) + text.substring(range.endOffset)
            if (!text) {
                nodeStart = nodeStart.parentElement
                let nodeP = nodeStart.parentElement
                if (isMathMLObject(nodeP) || nodeP.nodeName == 'math')
                    nodeStart.outerHTML = `<mi selanchor="0" selfocus="1">⬚</mi>`
                else
                    nodeStart.remove()
            } else {
                nodeStart.parentElement.setAttribute('selanchor', '-' + range.startOffset)
                nodeStart.textContent = text
            }
            refreshDisplays(uMath)
            return true
        }
    }

    if (nodeStart.nodeName == '#text')
        nodeStart = nodeStart.parentElement
    if (nodeStart.nodeName == 'math') {
        outputUndoStack = ['']
        removeSelAttributes(nodeStart)
        nodeStart.innerHTML = `<mi selanchor="0" selfocus="1">⬚</mi>`
        refreshDisplays('', true)
        return true
    }

    // Save current math for undo stack. If it's already on the stack top,
    // remove it since uMath will be added by checkEmpty()
    if (uMath == stackTop(outputUndoStack))
        outputUndoStack.pop()

    removeSelAttributes()
    if (sel)
        sel.deleteFromDocument()            // Deletes #text nodes but leaves
    else                                    //  some element nodes
        range.deleteContents()              // Ditto
    if (!testing && ummlConfig.debug)       // (Set breakpoint to see what got deleted)
        output_source.innerHTML = highlightMathML(escapeMathMLSpecialChars(indentMathML(output.innerHTML)));

    let node, nodeNext, nodeP

    if (!singleArg) {
        // Remove contentless elements that sel.deleteFromDocument() and
        // range.deleteContents() leave behind except for elements needed
        // as MathML object arguments
        for (node = nodeStart; node && !node.textContent; node = nodeNext) {
            nodeP = node.parentElement
            nodeNext = node.nextElementSibling
            if (nodeP.nodeName == 'mrow') {
                for (; nodeP.childElementCount > 1 && node && !node.textContent;
                    node = nodeNext) {
                    nodeNext = node.nextElementSibling
                    node.remove()
                }
                if (!node || node.textContent) {
                    // No element is left in mrow or element wasn't deleted.
                    // If only one child is left, replace an attribute-less
                    // mrow by that child
                    if (node && nodeP.childElementCount == 1 && !nodeP.attributes.length)
                        nodeP.parentElement.replaceChild(node, nodeP)
                    break;
                }
                if (isMathMLObject(nodeP))
                    nodeP.outerHTML = `<mi selanchor="0" selfocus="1">⬚</mi>`
                else
                    nodeP.remove()
            } else if (isMathMLObject(nodeP) && nodeNext && nodeNext.textContent) {
                node.innerHTML = `<mi selanchor="0" selfocus="1">⬚</mi>`
            } else {
                node.remove()
            }
        }
    }
    else if (!nodeStart.textContent) {
        if (isMathMLObject(nodeStart.parentElement) ||
            nodeStart.parentElement.nodeName == 'math') {
            nodeStart.outerHTML = `<mi selanchor="0" selfocus="1">⬚</mi>`
            refreshDisplays(uMath)
            return true
        }
        nodeStart.remove()
    }
    // Set up insertion point (IP)
    if (!sel)
        return true                         // Entered with a range

    node = sel.anchorNode                   // Anchor node after deletions
    let offset = sel.anchorOffset
    if (!offset)
        atEnd = false

    if (node.childElementCount) {
        let i = sel.anchorOffset            // Child index

        offset = 0                          // Start at child unless
        if (i == node.childElementCount) {  //  follows last child
            i--                             // Index of last child
            offset = 1                      // IP will follow last child
        }
        node = node.children[i]
        if (offset && node.childElementCount)
            offset = node.childElementCount // At end of last child
    }
    checkEmpty(node, offset, uMath)
    return true
}

function setSelAttributes(node, attr, value, attr1, value1) {
    if (!node)
        return
    if (node.nodeName == '#text')
        node = node.parentElement
    if (node.nodeName == 'mtext' && value[0] != '-')
        value = '-' + value
    node.setAttribute(attr, value)
    if (attr1)
        node.setAttribute(attr1, value1)
}

function deleteChar(node, offset) {
    let cchCh = 1
    let code = node.textContent.codePointAt(offset)
    if (isTrailSurrogate(code)) {
        cchCh = 2
        offset--
    } else if (code > 0xFFFF) {
        cchCh = 2
    }
    node.textContent = node.textContent.substring(0, offset)
        + node.textContent.substring(offset + cchCh)
    setSelAttributes(node, 'selanchor', node.textContent.length)
    return checkAutocomplete(node)
}

function checkAutocomplete(node) {
    if (node.textContent.length < 3)
        return null

    let cw = node.textContent.substring(1)
    let nodeP = node.parentElement

    return createAutoCompleteMenu(cw, 'output', e => {
        // User clicked matching control word: insert its symbol
        let val = e.currentTarget.innerText
        let symbol = val[val.length - 1]
        let nodeNew = document.createElement(getMmlTag(symbol))
        if (isDoubleStruck(symbol)) {
            let ch = doublestruckChar(symbol)
            nodeNew.setAttribute('intent', symbol)
            symbol = ch
        }
        nodeNew.textContent = symbol
        setSelAttributes(nodeNew, 'selanchor', '1')

        if (nodeP.hasAttribute('selanchor')) {
            nodeP.parentElement.replaceChild(nodeNew, nodeP)
        } else {
            // node is no longer a child of nodeP; find it
            let walker = document.createTreeWalker(nodeP,
                NodeFilter.SHOW_ELEMENT, null, false)
            while (walker.nextNode() && !walker.currentNode.hasAttribute('selanchor'))
                ;
            nodeP.replaceChild(nodeNew, walker.currentNode)
        }
        closeAutocompleteList()
        nodeP.innerHTML = nodeP.innerHTML // Force redraw
        refreshDisplays()
        speak(resolveSymbols(symbol))
        onac = true    // Suppress default speech, e.g., for 'mi'
    })
}

function checkEmpty(node, offset, uMath) {
    // If a deletion empties the active node, remove the node unless it's
    // required, e.g., for numerator, denominator, subscript, etc. For the
    // latter, insert the empty argument place holder '⬚'. Set the 'selanchor'
    // attribute for the node at the appropriate selection IP
    removeSelAttributes()

    if (node.nodeName == '#text')
        node = node.parentElement

    let nodeP = node.parentElement

    if (!node.textContent) {
        if (isMrowLike(nodeP) && nodeP.childElementCount > 1) {
            let nodeT = node.nextElementSibling
            node.remove()
            if (nodeT)
                setSelAttributes(nodeT, 'selanchor', '0')
            else
                setSelAttributes(nodeP, 'selanchor', nodeP.childElementCount)
        } else if (isMathMLObject(nodeP) || nodeP.nodeName == 'mtd') {
            node.outerHTML = `<mi selanchor="0" selfocus="1">⬚</mi>`
        } else {
            let nodeT = nodeP
            if (node.nextElementSibling)
                nodeT = node.nextElementSibling
            else if (node.previousElementSibling)
                nodeT = node.previousElementSibling
            node.remove()
            if (!nodeT.textContent && nodeT.nodeName == 'mrow' &&
                !isMathMLObject(nodeT.parentElement)) {
                nodeT.remove()
            } else {
                setSelAttributes(nodeT, 'selanchor', nodeT.textContent ? '1' : '0')
                setSelection(null, nodeT, 0)
                atEnd = true
            }
        }
    } else {
        if (offset == undefined)
            offset = atEnd ? '1' : '0'
        if (node.nodeName == '#text') {
            node = node.parentElement
            offset = '-' + offset
        }
        setSelAttributes(node, 'selanchor', offset)
    }
    if (output.firstElementChild && !output.firstElementChild.childElementCount)
        output.firstElementChild.innerHTML = `<mi selanchor="0" selfocus="1">⬚</mi>`
    refreshDisplays(uMath)
}

function checkAutoBuildUp(node, nodeP, key) {
    // Return new node if formula auto build up succeeds; else null
    if (!isMrowLike(nodeP) && (node.nodeName != 'mtext' || node.textContent[0] != '\\'))
        return null

    let cNode = nodeP.childElementCount
    if (key == '"') {
        for (let i = cNode - 1; i >= 0; i--) {
            if (nodeP.children[i].childElementCount)
                break;
            if (nodeP.children[i].textContent == '"') {
                // Replace child nodes i through cNode - 1 with <mtext>
                if (i == cNode - 1)
                    break;                  // No mtext content
                nodeP.removeChild(nodeP.children[i]) // Remove quote
                let str = ''
                for (let j = i + 1; j < cNode; j++) {
                    str += nodeP.children[i].textContent
                    nodeP.removeChild(nodeP.children[i])
                }
                let nodeNew = document.createElement('mtext')
                nodeNew.textContent = str
                nodeP.appendChild(nodeNew)
                return nodeP
            }
        }
    }
    if ('+=-<> )]|'.includes(key) ||
        key == '/' && !node.textContent.endsWith(')') || // Not end of numerator
        key == '#' && !node.textContent.endsWith('(')) { // Not hex RGB: eq-no
        // Try to build up <mrow> or trailing part of it
        let uMath = ''
        let [cParen, k, opBuildUp] = checkBrackets(nodeP)
        if (opBuildUp && (!cParen || k != -1)) {
            autoBuildUp = true
            if (!cParen) {
                // Same count of open and close delimiters: try to build
                // up nodeP: nodeP → UnicodeMath
                uMath = getUnicodeMath(nodeP)
            } else {
                // Differing count: try to build up nodeP trailing mi, mo,
                // mn, mtext children
                ksi = false
                for (let i = k + 1; i < cNode; i++)
                    uMath += dump(nodeP.children[i]);
            }
            uMath = uMath.replace('"\\"', '\\')
            let t = unicodemathml(uMath, true) // uMath → MathML
            if (autoBuildUp) {          // Autobuildup succeeded
                if (!testing && ummlConfig.debug) {
                    let pegjs_ast = t.details["intermediates"]["parse"];
                    let preprocess_ast = t.details["intermediates"]["preprocess"];
                    output_pegjs_ast.innerHTML = highlightJson(pegjs_ast) + "\n";
                    output_preprocess_ast.innerHTML = highlightJson(preprocess_ast) + "\n";
                }
                if (!cParen) {          // Full build up of nodeP
                    nodeP.innerHTML = t.mathml
                } else {                // Build up of trailing children
                    // Remove children[k + 1]...children[cNode - 1] and
                    // append their built-up counterparts
                    for (let i = cNode - 1; i > k; i--)
                        nodeP.children[i].remove()
                    const parser = new DOMParser();
                    let doc = parser.parseFromString(t.mathml, "application/xml");
                    nodeP.appendChild(doc.firstElementChild)
                }
                return nodeP
            }
        }
    }
    return null
}
function getArgName(node) {
    let name = node.parentElement.nodeName
    if (name[0] == 'M')
        console.log('Upper-case element name: ' + name)

    switch (name) {
        case 'msubsup':
        case 'munderover':
            if (!node.previousElementSibling)
                name = 'base';
            else if (node.nextElementSibling)
                name = isNary(node.previousElementSibling.textContent) ? 'lower limit' : 'subscript';
            else
                name = isNary(node.parentElement.firstElementChild.textContent) ? 'upper limit' : 'superscript';
            break;
        case 'mfrac':
            name = node.nextElementSibling ? 'numerator' : 'denominator'
            break;
        case 'mroot':
            name = node.nextElementSibling ? 'radicand' : 'index'
            break;
        case 'msub':
        case 'msup':
            name = node.nextElementSibling ? 'base'
                : name == 'msub' ? 'subscript' : 'superscript'
            break;
        case 'mover':
        case 'munder':
            name = node.nextElementSibling ? 'base'
                : name == 'munder' ? 'below' : 'above'
            break;
        case 'menclose':
            if (node.parentElement.attributes.notation)
                return node.parentElement.attributes.notation.nodeValue
        case 'msqrt':
            name = names[name]
            break;

        default:
            name = ''
    }
    return name
}

function moveLeft(sel, node, offset, e) {
    // Some left-arrow fix-ups are made in checkMathSelection(). Some need
    // to be made here before or instead of the default left-arrow behavior.
    // The default behavior moves to an element with a visible glyph, e.g.,
    // an <mi>, <mo>, <mn>, or <mtext> (childless elements). But for editing,
    // we need to stop before elements with children like <mfrac>, <msup>,
    // etc. And we need to stop at the start of the children, such as at the
    // end of a denominator. For now only enable going to start of math zone.
    if (offset)
        return
    if (node.nodeName == '#text')
        node = node.parentElement
    if (node.previousElementSibling)
        return                              // Use default
    while (!node.previousElementSibling) {
        node = node.parentElement
        if (node.nodeName == 'math') {
            setSelectionEx(sel, node, 0, e)
            return
        }
    }
}

function moveRight(sel, node, offset, e) {
    // Some right-arrow fix-ups are made in checkMathSelection(). Some need
    // to be made here before or instead of the default right-arrow behavior.
    // The default behavior moves to an element with a visible glyph, e.g.,
    // an <mi>, <mo>, <mn>, or <mtext> (childless elements). But for editing,
    // we need to stop before elements with children like <mfrac>, <msup>,
    // etc. And we need to stop at the ends of the children, such as at the
    // end of a numerator.
    let intent, name

    if (offset) {
        if (node.nodeName == '#text') {
            let text = node.textContent
            let cchCh = getCch(text, offset)
            offset += cchCh

            if (offset < text.length ||
                offset == text.length && !node.parentElement.nextElementSibling) {
                setSelectionEx(sel, node, offset, e)
                return
            }
            node = node.parentElement
            if (node.nextElementSibling) {
                node = node.nextElementSibling
                if (node.nodeName == 'mrow')
                    node = node.firstElementChild
                setSelectionEx(sel, node, 0, e)
                return
            }
            node = node.parentElement
            if (node.nextElementSibling) {
                node = node.nextElementSibling
                if (node.nodeName == 'mrow')
                    node = node.firstElementChild
                setSelectionEx(sel, node, 0, e)
                return
            }
            if (node.nodeName != 'mrow') {
                setSelectionEx(sel, node, node.childElementCount, e)
                return
            }
            offset = node.childElementCount
        }
        if (offset == node.childElementCount) { // (Excludes mi, mo, etc.)
            if (node.nextElementSibling) {
                setSelectionEx(sel, node.nextElementSibling, 0, e)
                return
            }
            if (node.nodeName == 'math')
                return                  // Already at end of math

            // Comes here for 'ⅆ𝜃/(𝑎+𝑏 sin⁡𝜃)' when IP follows sin⁡𝜃.
            // Should say 'end of denominator'
            if (node.nodeName == 'mrow' && !node.nextElementSibling) {
                node = node.parentElement
                if (node.nextElementSibling) {
                    node = node.nextElementSibling
                    if (node.nodeName == 'mrow')
                        node = node.firstElementChild
                    setSelectionEx(sel, node, 0, e)
                    return
                }
                name = getArgName(node)
                if (name)
                    speak('end of ' + name)
            } else {
                node = node.parentElement
                if (node.nodeName == 'mrow') {
                    if (node.nextElementSibling) {
                        // E.g., when leaving ∫_0^2𝜋 ⅆ𝜃/(𝑎+𝑏 sin⁡𝜃) move to
                        // nextElementSibling
                        node = node.nextElementSibling
                        setSelectionEx(sel, node, 0, e)
                        return
                    }
                }
            }
            setSelectionEx(sel, node, node.childElementCount, e)
            return
        }
        name = node.parentElement.nodeName
        if (isMathMLObject(node.parentElement) || name == 'mtd' ||
            name == 'mrow' && isMathMLObject(node.parentElement.parentElement)) {
            if (name == 'mrow' || name == 'mtd')
                node = node.parentElement
            while (!node.nextElementSibling) {
                node = node.parentElement
                if (isMrowLike(node)) {
                    setSelectionEx(sel, node, node.childElementCount, e)
                    return
                }
            }
            if (node.nodeName == 'mtr') {
                if (node.nextElementSibling)
                    node = node.nextElementSibling
                setSelectionEx(sel, node.firstElementChild.firstElementChild, 0, e)
                return
            }
            intent = node.parentElement.getAttribute('intent')
            node = node.nextElementSibling
            name = checkNaryand(node, intent)
            if (name)
                speak(name)
            else if (node.nodeName == 'mrow' || node.nodeName == 'mtd')
                node = node.firstElementChild
            setSelectionEx(sel, node, 0, e)
            return
        }
    }   // if (offset) {}

    if (node.nodeName == 'mtd') {
        setSelectionEx(sel, node.firstElementChild, 0, e)
        return
    }
    if (node.nodeName == 'math')
        node = node.firstElementChild

    if (!node.childElementCount) {          // mi, mn, mtext, #text
        let text = node.textContent
        let cchCh = getCch(text, 0)

        if (text.length > cchCh) {
            if (node.nodeName != '#text')
                node = node.firstChild
            setSelectionEx(sel, node, cchCh, e)
            return
        }
        if (node.nodeName == '#text')
            node = node.parentElement

        if (!node.nextElementSibling) {
            if (node.parentElement.nodeName == 'math') {
                node = node.parentElement
                setSelectionEx(sel, node, node.childElementCount, e)
                return
            }
            if (isMathMLObject(node.parentElement) && node.parentElement.nodeName != 'mrow') {
                setSelectionEx(sel, node, 1, e)
                speak('end of ' + getArgName(node))
                return
            }
            let nodeP = node.parentElement
            if (nodeP.nodeName == 'mrow') {
                let intent = nodeP.getAttribute('intent')
                if (intent == ':function') {
                    name = 'function'
                } else {
                    intent = nodeP.parentElement.getAttribute('intent')
                    name = checkNaryand(node, intent)
                }
                if (!name)
                    name = getArgName(nodeP)
                if (name)
                    speak('end of ' + name)
                setSelectionEx(sel, node, 1, e)
                return
            }
            if (nodeP.nodeName == 'mtd') {
                name = 'element'
                let nameT = getTableRowName(nodeP.parentElement)
                let nodePP = nodeP.parentElement
                let row = getChildIndex(nodePP, nodePP.parentElement) + 1
                let col = ''

                if (nameT == 'row') {
                    col = getChildIndex(nodeP, nodePP) + 1
                } else if (!nodeP.nextElementSibling) {
                    name = nameT
                } else {
                    speak('＆')
                    node = nodeP.nextElementSibling
                    setSelectionEx(sel, node, offset, e)
                    return
                }
                offset = node.childElementCount ? node.childElementCount : 1
                name += ' ' + row + ' ' + col
                speak('end ' + name)
                setSelectionEx(sel, node, offset, e)
            }
        } else if ((!isMathMLObject(node.parentElement) || isMrowLike(node.parentElement)) &&
            isMathMLObject(node.nextElementSibling)) {
            // Moving from childless element to MathML element with
            // children as for moving past '=' in '=1/√(𝑎²−𝑏²)'
            node = node.nextElementSibling
            //if (node.nodeName == 'mrow') {
            //    intent = node.getAttribute('intent')
            //    if (intent) {
            //        name = ''
            //        if (intent == ':function')
            //            name = 'function'
            //        else if (intent.startsWith('binomial-coefficient'))
            //            name = 'binomial-coefficient'
            //        else if (intent == ':fenced')
            //            name = 'fenced'
            //        if (name)
            //            speak(name)
            //    } else {
            //        node = node.firstElementChild
            //    }
            //}
            setSelectionEx(sel, node, 0, e)
            return
        } else if (isMathMLObject(node.parentElement) && node.parentElement.nodeName != 'mrow') {
            setSelectionEx(sel, node, 1, e)
            speak('end of ' + getArgName(node))
            return
        } else if (node.nextElementSibling.nodeName == 'mtable') {
            node = node.nextElementSibling
            intent = node.getAttribute('intent')
            if (!intent)
                intent = 'array'
            else if (intent[0] == ':') {
                intent = intent.substring(1)
                let i = intent.indexOf('(')
                let prefix = ''
                if (i != -1) {
                    prefix = intent.substring(i + 1, intent.length - 1)
                    prefix = prefix.replace(',', ' by ')
                    intent = prefix + ' ' + intent.substring(0, i)
                }
            }
            speak(intent)
            setTimeout(function () { }, 1000)
            setSelectionEx(sel, node, 0, e)
        } else if (!node.childNodes.length) {   // 'malignmark' or 'maligngroup'
            speak('＆')
            node = node.nextElementSibling
        } else {
            setSelectionEx(sel, node.nextElementSibling, 0, e)
            return
        }
    } else if (isMathMLObject(node) || node.nodeName == 'mrow') {
        // Happens moving into square root, e.g., for '√(𝑎²−𝑏²)'.
        // Default moves to '𝑎' but should only move to '𝑎²'
        removeSelAttributes()
        node = node.firstElementChild
        if (node.nodeName == 'mrow') {
            intent = node.getAttribute('intent')
            if (intent) {
                if (intent.startsWith('binomial-coefficient'))
                    name = 'binomial coefficient'
                else if (intent == ':fenced')
                    name = 'fenced'
                if (name)
                    speak(name)
                setTimeout(function () { }, 1000)
            }
            node = node.firstElementChild
        } else if (node.nodeName == 'mtr') {
            node = node.firstElementChild.firstElementChild
            if (!node.childNodes.length) {   // 'malignmark' or 'maligngroup'
                node = node.nextElementSibling
                speak('＆')
            }
        }
        setSelectionEx(sel, node, 0, e)
    }
}

// Output-element context-menu functions
function closeContextMenu() {
    if (contextmenuNode) {
        contextmenuNode = null
        let contextMenu = document.getElementById("contextmenu")
        output.removeChild(contextMenu)
    }
}

output.addEventListener('contextmenu', (e) => {
    // Create input element to receive intent for target node if selection
    // is collapsed and for starting node of selection if selection isn't
    // collapsed. Eventually add more context-menu functionality...
    e.preventDefault()
    let contextMenu = document.createElement('div')
    contextMenu.setAttribute('id', 'contextmenu')
    contextmenuNode = e.target
    let sel = window.getSelection()
    if (!sel.isCollapsed) {
        let range = sel.getRangeAt(0)
        contextmenuNode = range.startContainer
    }
    if (contextmenuNode.nodeName == '#text')
        contextmenuNode = contextmenuNode.parentElement
    if (contextmenuNode.nodeName == 'mrow' && contextmenuNode.parentElement.nodeName == 'math')
        contextmenuNode = contextmenuNode.parentElement

    let name = contextmenuNode.nodeName
    if (name == 'math') {
        name = 'math zone'
    } else {
        name = names[name]
        if (!name) {
            name = getUnicodeMath(contextmenuNode, false)
            if (name == '|' && contextmenuNode.parentElement.nodeName == 'mrow') {
                contextmenuNode = contextmenuNode.parentElement
            }
        }
    }
    let intentCurrent = contextmenuNode.getAttribute('intent')
    if (!intentCurrent) {
        intentCurrent = contextmenuNode.getAttribute('arg')
        if (intentCurrent)
            intentCurrent = 'arg=' + intentCurrent
    }
    let str = `<input type="text" id="contextmenuinput" placeholder="Enter intent for ${name}" onfocusout="closeContextMenu()""></input>`
    contextMenu.innerHTML = str
    let node = contextMenu.firstElementChild
    node.style.backgroundColor = 'black'
    node.style.color = 'white'
    node.style.width = '100%'
    node.style.border = '1px solid #d4d4d4'
    output.appendChild(contextMenu)
    let text = document.getElementById('contextmenuinput')
    text.value = intentCurrent          // Show current intent (if any)
    node.focus()
})

output.addEventListener('dragstart', (e) => {
    // Drag selection as MathML in the 'text/plain' slot
    let mathml = getMathSelection()
    e.dataTransfer.setData("text/plain", mathml)
    console.log('drag "' + mathml + '"')
})

output.addEventListener('dragenter', (e) => {
    e.preventDefault()                      // Allow drop
})

output.addEventListener('dragover', (e) => {
    e.preventDefault()                      // Allow drop
})

output.addEventListener('drop', (e) => {
    e.preventDefault()
    let sel = window.getSelection()
    let range = sel.getRangeAt(0)
    let mathml = e.dataTransfer.getData('text/plain')
    if (pasteMathML(mathml, e.target, 0) && !e.ctrlKey)
        deleteSelection(range)
    console.log('drop "' + mathml + '"')
})

function handleContextMenu(e) {
    let x = document.getElementById('contextmenu')
    if (!x)
        return false

    switch (e.key) {
        case 'Enter':
        case 'Tab':
            e.preventDefault()
            let attr = 'intent'
            let i
            let textNode = document.getElementById('contextmenuinput')
            let text = textNode.value

            // If text is ASCII-alphabetic up to an '=', set attr equal to
            // that ASCII-alphabetic string and set text to the substring
            // following the '='. Enables arg = 'a', etc.
            for (i = 0; i < text.length && isAsciiAlphabetic(text[i]); i++)
                ;
            if (i < text.length && text[i] == '=') {
                attr = text.substring(0, i)
                text = text.substring(i + 1)
            }
            if (text)
                contextmenuNode.setAttribute(attr, text)
            else
                contextmenuNode.removeAttribute(attr)
        // Fall thru to 'Escape'
        case 'Escape':
            closeContextMenu()
            if (!testing)
                output_source.innerHTML = highlightMathML(escapeMathMLSpecialChars(indentMathML(output.innerHTML)))
    }
    return true
}

function readPaste() {
    // Try to read HTML with embedded MathML from the clipboard and paste
    // the MathML. If failure, paste plain text
    navigator.clipboard.read().then((clipContents) => {
        if (clipContents[0].types.includes('text/html')) {
            clipContents[0].getType('text/html').then((blob) => {
                blob.text().then((html) => {
                    let i = html.indexOf('<math')
                    if (i == -1) {
                        readPasteText()
                        return
                    }
                    let j = html.indexOf('</math', i)
                    let mathml = html.substring(i, j + 7)
                    let sel = window.getSelection()
                    if (!testing)
                        console.log('HTML = ' + html)
                    pasteMathML(mathml, sel.anchorNode, sel.anchorOffset, sel)
                })
            })
        } else {
            readPasteText()
        }
    })
}

function readPasteText() {
    navigator.clipboard.readText().then((clipText) => {
        let sel = window.getSelection()
        pasteMathML(clipText, sel.anchorNode, sel.anchorOffset, sel)
    })
}

function pasteMathML(clipText, node, offset, sel) {
    if (!isMathML(clipText)) {
        let t = unicodemathml(clipText, true)
        clipText = t.mathml
    }
    if(!testing)
        console.log('MathML = ' + clipText)
    let nodeNew = getMathMLDOM(clipText)
    if (!nodeNew)
        return false
    nodeNew = nodeNew.firstElementChild
    if (!nodeNew || nodeNew.nodeName != 'math')
        return false
    let i = nodeNew.childElementCount
    if (!i)
        return false
    let uMath
    if (clipText.indexOf('DLMF') != -1 || clipText.indexOf('ltx_') != -1) {
        // Equation from Digital Library of Mathmatical Functions. Convert
        // nodeNew to UnicodeMath and back since native MathML rendering
        // doesn't display nodeNew for some reason...
        uMath = getUnicodeMath(nodeNew, true)
        let t = unicodemathml(uMath, true) // uMath → MathML
        output.innerHTML = t.mathml
        refreshDisplays('', true)
        return true
    }
    uMath = getUnicodeMath(output.firstElementChild, true)
    if (sel && (deleteSelection() || sel.anchorNode.textContent == '⬚')) {
        node = sel.anchorNode
        offset = sel.anchorOffset
        if (node.nodeName == '#text')
            node = node.parentElement
        if (node.parentElement.nodeName == 'math') {
            node = node.parentElement
            node.innerHTML = '<mrow/>'      // Make room for paste
            node = node.firstElementChild
            setSelection(sel, node, 0)
        }
    }

    // Set up IP to follow pasted nodes
    let nodeNewLEC = nodeNew.lastElementChild
    let offsetNewLEC = nodeNewLEC.childElementCount ? nodeNewLEC.childElementCount : 1
    removeSelAttributes()
    nodeNewLEC.setAttribute('selanchor', offsetNewLEC)

    let name = node.nodeName
    if (name == '#text') {
        if (offset != 0)
            offset = 1
        node = node.parentElement
        name = node.nodeName
    }

    if (name == 'math' && node.firstElementChild.nodeName == 'mrow') {
        atEnd = offset != 0
        node = node.firstElementChild
        name = 'mrow'
    }
    if (name == 'mrow' || name == 'math') {
        let cChild = node.childElementCount
        while (i--) {
            if (offset || !cChild)
                node.appendChild(nodeNew.children[0])
            else
                node.insertBefore(nodeNew.children[0], node.children[0])
        }
        refreshDisplays(uMath)
        return true
    } else if (node.parentElement.nodeName == 'mrow') {
        if (offset && node.nextElementSibling) {
            node = node.nextElementSibling  // Convert to insertBefore
            offset = 0
        }
        while (i--) {                       // Insert nodeNew.children
            if (!offset)
                node.parentElement.insertBefore(nodeNew.children[0], node)
            else
                node.parentElement.appendChild(nodeNew.children[0])
        }
    } else {
        if (i == 1) {
            nodeNew = nodeNew.firstElementChild
        } else {
            let nodeT = document.createElement('mrow')
            while (i--)
                nodeT.appendChild(nodeNew.children[0])
            nodeNew = nodeT
        }
        insertNode(node, 0, nodeNew, node.parentElement)
    }
    console.log('clipText = ' + clipText)
    refreshDisplays(uMath)
    return true
}

var onac = false                        // true immediately after autocomplete click

output.addEventListener("click", (e) => {
    if (onac) {                         // Ignore click that follows autocomplete click
        onac = false
        return
    }
    closeContextMenu()
    inSelChange = false
    //removeSelAttributes()
    let sel = window.getSelection()
    let node = sel.anchorNode
    console.log('getSelection anchorNode = ' + node.nodeName)

    if (node.nodeName == 'DIV')
        return                          // </math>
    atEnd = node.length == sel.anchorOffset
    if (sel.isCollapsed && node.nodeName == '#text' && node.textContent == '⬚')
        setSelection(sel, node, SELECTNODE)
    checkSimpleSup(node.parentElement.parentElement)
    //speechSel(sel)
})

function selectMathZone() {
    let node = output.firstElementChild
    removeSelAttributes(node)
    setSelection(null, node, SELECTNODE)
    let offset = node.childElementCount ? node.childElementCount : 1
    setSelAttributes(node, 'selanchor', '0', 'selfocus', offset)
    refreshDisplays('', true)
}

function getMathSelection() {
    let sel = window.getSelection()
    if (sel.isCollapsed)
        selectMathZone()
    let range = sel.getRangeAt(0)
    let nodeS = range.startContainer
    if (nodeS.nodeName == '#text')
        nodeS = nodeS.parentElement
    let nodeE = range.endContainer
    if (nodeE.nodeName == '#text')
        nodeE = nodeE.parentElement
    let node = range.commonAncestorContainer
    if (node.nodeName == '#text')
        node = node.parentElement
    let walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, null)
    let mathml = ''

    while (node && node !== nodeS)
        node = walker.nextNode()            // Advance walker to starting node

    let done = false

    while (node && !done) {
        mathml += node.outerHTML
        if (node === nodeE)                 // Reached the ending node
            break
        if (!walker.nextSibling()) {
            while (true) {                  // Bypass current node
                if (!walker.nextNode()) {
                    done = true
                    break
                }
                let position = walker.currentNode.compareDocumentPosition(node)
                if (!(position & 8))
                    break                   // currentNode isn't inside node
            }
        }
        node = walker.currentNode
    }
    if (!mathml.startsWith('<math'))
        mathml = `<math display="block" xmlns="http://www.w3.org/1998/Math/MathML">${mathml}</math>`
    mathml = mathml.replace(/&nbsp;/g, ' ')
    mathml = mathml.replace(/<malignmark><\/malignmark>/g, '<malignmark/>')
    mathml = mathml.replace(/<maligngroup><\/maligngroup>/g, '<maligngroup/>')
    return removeMathMlSelAttributes(mathml)
}

document.addEventListener('keydown', function (e) {
    if (e.altKey) {
        switch (e.key) {
            case 'a':                       // Alt+a
                document.getElementById("about").click()
                return

            case 'b':                       // Alt+b
                // Braille MathML
                e.preventDefault()
                let mathML = isMathML(input.value)
                    ? input.value
                    : document.getElementById('output_source').innerText
                let braille = MathMLtoBraille(mathML)
                console.log('Math braille = ' + braille)
                speechDisplay.innerText += '\n' + braille
                return

            case 'd':                       // Alt+d
                // Toggle dictation mode on/off
                e.preventDefault()
                startDictation()
                return

            case 'Enter':                   // Alt+Enter
                // Enter Examples[iExample] (see also Demo mode)
                let x = document.getElementById('Examples').childNodes[0]
                input.value = x.childNodes[iExample].innerText
                var cExamples = x.childNodes.length

                iExample++                 // Increment for next time
                if (iExample > cExamples - 1)
                    iExample = 0
                return

            case 'h':                       // Alt+h
                document.getElementById("help").click()
                return

            case 'm':                       // Alt+m
                // Toggle Unicode and MathML in input display
                e.preventDefault()
                ksi = true
                input.value = isMathML(input.value)
                    ? MathMLtoUnicodeMath(input.value, true)
                    : document.getElementById('output_source').innerText
                draw()
                return

            case 'p':                       // Alt+p
                // Presentation: toggle demo mode on/off
                e.preventDefault()
                startDemo()
                return

            case 's':                       // Alt+s
                // Speak MathML
                e.preventDefault()
                if (speechSynthesis.speaking) {
                    speechSynthesis.cancel()
                } else {
                    let mathML = isMathML(input.value)
                        ? input.value
                        : document.getElementById('output_source').innerText
                    let speech = MathMLtoSpeech(mathML)
                    console.log('Math speech = ' + speech)
                    speechDisplay.innerText = '\n' + speech
                    let utterance = new SpeechSynthesisUtterance(speech)
                    if (voiceZira)
                        utterance.voice = voiceZira
                    speechSynthesis.speak(utterance)
                }
                return

            case 't':                       // Alt+t
                // MathML to Unicode [La]TeX
                e.preventDefault()
                mathTeX()
                return
        }
    }
})

output.addEventListener('keydown', function (e) {
    let key = e.key
    keydownLast = key

    if (output.firstElementChild.nodeName == 'MJX-CONTAINER') {
        // MathJax is active. Copying the whole math zone is supported
        e.preventDefault()
        if (key.length > 1)
            return
        if (e.ctrlKey && key == 'c') {      // Ctrl+c
            let node = getMathJaxMathMlNode()
            let mathml = node.outerHTML
            if (mathml.startsWith('<math'))
                navigator.clipboard.writeText(mathml)
        }
        return
    }
    let x = document.getElementById(this.id + "autocomplete-list")
    if (handleAutocompleteKeys(x, e))
        return

    if (handleContextMenu(e))
        return

    let i, k
    let cchCh
    let intent = ''
    let sel = window.getSelection()

    let range = document.createRange()
    if (sel.type != 'None')
        range = sel.getRangeAt(0)           // Save entry selection

    let node = sel.focusNode
    let name = node.nodeName
    let offset = sel.focusOffset
    let uMath

    if (node.nodeName == 'DIV') {
        node = node.firstElementChild
        if (!node || node.nodeName != 'math') {
            // No MathML in output display; insert a math zone
            node.innerHTML = `<math display="block"><mi selanchor="0" selfocus="1">⬚</mi></math>`
            node = node.firstElementChild
            name = 'math'
            sel = setSelection(sel, node, 0)
            atEnd = true
        } else {                            // Move to first math-zone child
            node = node.firstElementChild
            sel = setSelection(sel, node, 0)
            atEnd = false
        }
    }

    switch (key) {
        case 'ArrowRight':
            moveRight(sel, node, offset, e)
            return

        case 'ArrowLeft':
            moveLeft(sel, node, offset, e)
            return

        case 'Backspace':
            e.preventDefault()
            if (deleteSelection())
                return
            if (node.nodeName == 'math') {
                if (!offset)
                    return
                node = node.children[offset - 1]
            }
            if (isMathMLObject(node)) {
                setSelection(sel, node, SELECTNODE)
                return
            }
            uMath = getUnicodeMath(output.firstElementChild, true)
            if (node.nodeName == '#text') {
                if (offset > 0) {
                    offset--
                    let autocl = deleteChar(node, offset)
                    if (autocl != undefined)
                        this.parentNode.appendChild(autocl)
                    checkEmpty(node, -offset, uMath)
                    return
                }
                node = node.parentElement
            }
            while (node.nodeName == 'mrow' && node.lastElementChild)
                node = node.lastElementChild

            if (isMathMLObject(node)) {
                setSelection(sel, node, SELECTNODE)
                return
            }
            if (offset > 0) {
                cchCh = getCch(node.textContent, offset - 1)
                if (offset < cchCh)
                    offset = cchCh
                node.textContent = node.textContent.substring(0, offset - cchCh) +
                    node.textContent.substring(offset)
            } else if (node.previousSibling) {
                node = node.previousSibling
                cchCh = getCch(node.textContent, node.textContent.length - 1)
                node.textContent = node.textContent.substring(0,
                    node.textContent.length - cchCh)
            }
            checkEmpty(node, 0, uMath)
            return

        case 'Delete':
            e.preventDefault()
            if (deleteSelection())
                return

            if (node.nodeName == 'math')
                return

            if (isMathMLObject(node)) {
                setSelection(sel, node, SELECTNODE)
                return
            }
            uMath = getUnicodeMath(output.firstElementChild, true)
            if (node.nodeName == '#text') {
                if (offset < node.textContent.length) {
                    let autocl = deleteChar(node, offset)
                    if (autocl != undefined)
                        this.parentNode.appendChild(autocl)
                    checkEmpty(node, -offset, uMath)
                    return
                }
                node = node.parentElement
            }
            if (node.nodeName == 'mrow' && node.childElementCount)
                node = node.children[offset]

            if (isMathMLObject(node)) {
                setSelection(sel, node, SELECTNODE)
                return
            }
            cchCh = getCch(node.textContent, 0)
            node.textContent = node.textContent.substring(cchCh)

            checkEmpty(node, 0, uMath)
            return

        case 'End':
        case 'Home':
            e.preventDefault()
            node = output.firstElementChild
            if (node.nodeName != 'math' || node.firstElementChild.textContent == '⬚')
                return
            if (key == 'End') {
                offset = node.childElementCount
                name = 'end of math'
            } else {
                node = node.firstElementChild
                if (node.nodeName == 'mrow')
                    node = node.firstElementChild
                name = 'Start of math , ' + getName(node)
                offset = 0
            }
            if(!testing)
                speak(name)
            removeSelAttributes()
            setSelAttributes(node, 'selanchor', offset)
            refreshDisplays('', true)
            return
    }
    if (key.length > 1 && !inRange('\uD800', key[0], '\uDBFF')) // 'Shift', etc.
        return

    e.preventDefault()
    let mathmlCurrent
    let t
    let walker

    if (e.ctrlKey) {
        switch (key) {
            case 'a':                       // Ctrl+a
                // Select math zone
                selectMathZone()
                return

            case 'b':                       // Ctrl+b
            case 'i':                       // Ctrl+i
                // Toggle math bold/italic ()
                if (sel.isCollapsed)
                    return
                if (node.nodeName == '#text')
                    node = node.parentElement
                let chars = node.textContent;

                if (chars.length == 1 && chars != 'ℎ') {
                    // Single letters display in math italic unless
                    // mathvariant = 'normal'
                    if (node.attributes.mathvariant &&
                        node.attributes.mathvariant.value == 'normal') {
                        node.removeAttribute('mathvariant')
                    } else {
                        chars = italicizeCharacter(chars)
                    }
                }
                chars = boldItalicToggle(chars, key)
                node.textContent = chars
                if (chars.length == 1 && chars != 'ℎ' && node.nodeName == 'mi')
                    node.setAttribute('mathvariant', 'normal')
                refreshDisplays()
                return

            case 'C':
                // Define xmlns and use <mfenced> for Word
                mathmlCurrent = output.innerHTML
                if (sel.isCollapsed)
                    selectMathZone()
                uMath = getUnicodeMath(output.firstElementChild, false)
                useMfenced = 1                 // Get Word-friendly MathML
                t = unicodemathml(uMath, true) // uMath → MathML
                output.innerHTML = t.mathml
                refreshDisplays('', true)
                sel = window.getSelection()
            // Fall through to case 'c'
            case 'c':                       // Ctrl+c
            case 'x':                       // Ctrl+x
                let mathml = getMathSelection()
                navigator.clipboard.writeText(mathml)
                if (mathmlCurrent) {
                    output.innerHTML = mathmlCurrent
                    refreshDisplays('', true)
                }
                if (key == 'x') {
                    uMath = getUnicodeMath(output.firstElementChild, true)
                    deleteSelection()
                    node = sel.anchorNode
                    if (node.nodeName == '#text')
                        node = node.parentElement
                    setSelAttributes(node, 'selanchor', 0)
                    refreshDisplays(uMath, true)
                }
                return

            case 'r':                       // Ctrl+r
                // Refresh MathML display (MathML → UnicodeMath → MathML)
                uMath = getUnicodeMath(output.firstElementChild, true)
                t = unicodemathml(uMath, true) // uMath → MathML
                output.innerHTML = t.mathml
                refreshDisplays('', true)
                return

            case 'v':                       // Ctrl+v
                readPaste()
                return

            case 'y':                       // Ctrl+y
                // Redo
                if (!outputRedoStack.length)
                    return
                uMath = getUnicodeMath(output.firstElementChild, true)
                outputUndoStack.push(uMath)
                uMath = outputRedoStack.pop()
                setUnicodeMath(uMath)
                return

            case 'z':                       // Ctrl+z
                if (!outputUndoStack.length)
                    return
                uMath = getUnicodeMath(output.firstElementChild, true)
                outputRedoStack.push(uMath)
                let undoTop = stackTop(outputUndoStack)
                if (uMath == undoTop)
                    outputUndoStack.pop()
                uMath = outputUndoStack.pop()
                setUnicodeMath(uMath)
                return
        }                                   // switch(e.key) {}
    } else if (e.altKey) {                  // Alt+x: hex → Unicode
        if (e.key != 'x')
            return
        let cchSel = 0                      // Default degenerate selection
        let str = ''                        // Collects hex string

        if (!sel.isCollapsed) {             // Nondegenerate selection
            let rg = sel.getRangeAt(0)
            node = rg.endContainer
            str = rg + ''
            cchSel = str.length
        }
        if (node.nodeName == '#text')
            node = node.parentElement
        let nodeP = node.parentElement
        if (nodeP.nodeName != 'mrow')
            return
        let cNode = nodeP.childElementCount
        let iEnd = -1                       // Index of node in nodeP
        let iStart = 0                      // Index of 1st node that
                                            //  might be part of hex
        // Collect span of alphanumerics ending with node
        for (i = cNode - 1; i >= 0; i--) {
            let nodeC = nodeP.children[i]
            if (nodeC.nodeName != 'mi' && nodeC.nodeName != 'mn') {
                if (iEnd > 0) {     // Index of last node is defined
                    iStart = i + 1  // Set index of first node
                    break
                }
            } else {
                if (nodeC == node)
                    iEnd = i        // Found node's index
                if (iEnd > 0 && !cchSel)
                    str = nodeC.textContent + str
            }
        }
        let [ch, cchDel] = hexToUnicode(str, str.length, cchSel)

        // Remove cchDel codes along with emptied nodes
        for (i = iEnd; i >= iStart && cchDel > 0; i--) {
            let nodeC = nodeP.children[i]
            let cch = nodeC.textContent.length

            if (cch > cchDel) {     // ∃ more codes than need deletion
                nodeC.innerHTML = nodeC.innerHTML.substring(0, cch - cchDel)
                break;
            }
            cchDel -= cch
            if (nodeP.childElementCount == 1) {
                // Leave empty child as place holder for ch
                nodeC.innerHTML = ''
            } else {
                nodeC.remove()
            }
        }
        node = nodeP.children[i >= 0 ? i : 0]
        name = node.nodeName
        atEnd = true
        key = ch
        return
    }

    // Handle character input
    if (name == '#text')
        node = node.parentElement

    let nodeP = node
    if (!node.childElementCount && name != 'math')
        nodeP = node.parentElement

    atEnd = sel.anchorOffset != 0
    let nodeT = checkAutoBuildUp(node, nodeP, key)
    if (nodeT) {
        node = nodeT                        // FAB succeeded: update node
        atEnd = true
        if (key == ' ' || key == '"') {     // Set insertion point
            let cChild = node.childElementCount
            if (cChild) {
                while (node.nodeName == 'mrow') {
                    node = node.lastElementChild
                    cChild = node.childElementCount
                }
                node.setAttribute('selanchor', cChild ? cChild : 1)
            }
        } else {
            setSelection(sel, node, node.childElementCount ? node.childElementCount : 1)
            handleKeyboardInput(node, key, sel)
        }
        refreshDisplays('', true)
        autoBuildUp = false
        return
    }
    let autocl = handleKeyboardInput(node, key, sel)

    // If defined, append autocomplete list to output autocomplete container
    if (autocl != undefined)
        this.parentNode.appendChild(autocl)

    // Ignore other input for now
})

function checkResize() {
    let h = document.getElementsByTagName('h1');
    let heading = document.getElementById("heading");
    if (heading == undefined) {
        testing = true
        return                              // (for tests)
    }

    if (window.innerHeight > 1000) {
        let outputs = document.getElementsByClassName('tabcontent');
        for (let i = 0; i < outputs.length; i++) {
            outputs[i].style.height = '500px';
        }
    }
}

checkResize();

if (!testing) {
    if (window.innerWidth < 768 || !ummlConfig.debug) {
        // Suppress AST tabs for mobile devices
        var tabs = document.getElementsByClassName('tabs');
        tabs[0].style.display = "none";

        if (!input.value)
            output_source.innerHTML = 'MathML will appear here'

        if (window.innerWidth <= 768) {
            let history = document.getElementsByClassName("history")
            history[0].style.display = "none"
        }
    }

    // if tracing is enabled, add trace tab
    if (ummlConfig.tracing) {
        var tempElem = document.createElement('button');
        tempElem.classList.add('tab');
        tempElem.id = 'trace';
        tempElem.innerHTML = 'Trace';
        document.getElementById('pegjs_ast').parentNode.insertBefore(tempElem, document.getElementById('pegjs_ast').nextSibling);

        tempElem = document.createElement('pre');
        tempElem.id = 'output_trace';
        output_pegjs_ast.parentNode.insertBefore(tempElem, output_pegjs_ast.nextSibling);
        var output_trace = document.getElementById('output_trace');
    }

    // load local storage data from previous page load
    if (window.localStorage.getItem('unicodemath')) {
        input.innerHTML = window.localStorage.getItem('unicodemath').replace(/LINEBREAK/g, '\n');
        draw();
    }
    if (window.localStorage.getItem('active_tab')) {
        setActiveTab(window.localStorage.getItem('active_tab'));
    } else {
        setActiveTab(activeTab);
    }
    if (window.localStorage.getItem('history')) {
        hist = JSON.parse(window.localStorage.getItem('history'));
        displayHistory();
    }
}

// Enable autocorrect and autocomplete
autocomplete();
function setSpeech() {
    return new Promise(
        function (resolve, reject) {
            let synth = window.speechSynthesis;
            let id = setInterval(() => {
                if (synth.getVoices().length !== 0) {
                    resolve(synth.getVoices());
                    clearInterval(id);
                }
            }, 10);
        }
    )
}
// Use Zira for speech if she's available
var voiceZira
let s = setSpeech();

s.then(v => voiceZira = v.filter(val => val.name.startsWith('Microsoft Zira'))[0])

function getCodePoints() {
    // display code points and symbol names for the input characters
    if (window.innerHeight < 1000)
        input.style.height = "200px";
    input.style.fontSize = "1.5rem";
    var codepoints_HTML = "";
    Array.from(input.value).forEach(c => {
        var cp = c.codePointAt(0).toString(16).padStart(4, '0').toUpperCase();

        // highlight special invisible characters and spaces (via
        // https://en.wikipedia.org/wiki/Whitespace_character#Unicode,
        // https://www.ptiglobal.com/2018/04/26/the-beauty-of-unicode-zero-width-characters/,
        // https://330k.github.io/misc_tools/unicode_steganography.html)
        var invisibleChar = [
            "0009", "000A", "000B", "000C", "000D", "0020", "0085", "00A0",
            "1680", "2000", "2001", "2002", "2003", "2004", "2005", "2006",
            "2007", "2008", "2009", "200A", "200B", "200C", "200D", "200E",
            "2028", "2029", "202A", "202C", "202D", "202F", "205F", "2060",
            "2061", "2062", "2063", "2064", "2800", "3000", "180E", "FEFF",
        ].includes(cp);

        // lookup unicode data for tooltip
        var tooltip = "";
        if (typeof getCodepointData === "function") {
            try {
                var cpd = getCodepointData(cp);
                tooltip = `Name: ${cpd["name"].replace("<", "&amp;lt;").replace(">", "&amp;gt;")}<br>Block: ${cpd["block"]}<br>Category: ${cpd["category"]}`;
            } catch (e) {
                tooltip = "no info found";
            }
        }

        // Prepend tooltip symbol names defined for the on-screen buttons,
        // or derived from controlWords or from math alphanumerics
        if (!testing) {
            let symbol = symbolTooltips[c]
            if (!symbol) {
                symbol = symbolNames[c]     // From controlWords
                if (symbol) {
                    symbol = '\\' + symbol
                } else if (isAlphanumeric(c)) { // Get math-alphanumeric control word 
                    let [anCode, chFolded] = foldMathAlphanumeric(c.codePointAt(0), c)
                    if (anCode)
                        symbol = '\\' + anCode + chFolded
                } else {
                    symbol = c
                    if (c == '"')
                        symbol = '&#x0022'
                }
            }
            tooltip = symbol + "<hr>" + tooltip
        }
        codepoints_HTML += '<div class="cp' + (invisibleChar ? ' invisible-char' : '') + '" data-tooltip="' + tooltip + '"><div class="p">' + cp + '</div><div class="c">' + c + '</div></div>'

        if (c == "\n")
            codepoints_HTML += "<br>"
    });
    return codepoints_HTML
}

// compile and draw mathml code from input field
async function draw(undo) {

    // if required, wait for the parser to be generated, via
    // https://stackoverflow.com/a/39914235
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    while (typeof ummlParser === "undefined") {
        await sleep(10);
    }

    // avoid doing anything if the input hasn't changed – e.g. when the
    // user has only been moving the cursor
    if (input.value == prevInputValue) {
        return;
    }

    // clear some stuff
    if (!testing) {
        codepoints.innerHTML = "";
        speechDisplay.innerHTML = "";
    }
    if (ummlConfig.tracing)
        output_trace.innerHTML = ""

    //output.classList.add("hideAll");

    // if the input field is empty (as it is in the beginning), avoid doing much
    // with its contents
    if (input.value == "") {
        output.innerHTML = "";
        output_pegjs_ast.innerHTML = "";
        output_preprocess_ast.innerHTML = "";
        output_mathml_ast.innerHTML = "";
        output_source.innerHTML = !ummlConfig.debug ? 'MathML will appear here' : ''
        measurements_parse.innerHTML = "";
        measurements_transform.innerHTML = "";
        measurements_pretty.innerHTML = "";
        measurements_parse.title = "";
        measurements_transform.title = "";
        measurements_pretty.title = "";
        window.localStorage.setItem('unicodemath', "");
        closeAutocompleteList();
        prevInputValue = "";
        inputUndoStack = [{uMath: ''}]
        inputRedoStack = []
        outputUndoStack = ['']
        outputRedoStack = ['']
        return;
    }

    prevInputValue = input.value;

    if (isMathML(input.value)) {
        // Resize to display input MathML
        input.style.height = window.innerHeight > 1000 ? "500px" : "400px";
        input.style.fontSize = "0.9rem";
    } else if(!testing) {
        codepoints.innerHTML = getCodePoints()
    }
    // update local storage
    window.localStorage.setItem('unicodemath', input.value.replace(/\n\r?/g, 'LINEBREAK'));

    if (undo == undefined) {
        let undoTop = stackTop(inputUndoStack)
        if (input.value != undoTop.uMath) {
            let undoNext = {uMath: input.value, selStart: input.selectionStart,
                            selEnd: input.selectionEnd}
            inputUndoStack.push(undoNext)
        }
    }

    // get input(s) – depending on the ummlConfig.splitInput option, either...
    var inp;
    if (ummlConfig.splitInput && !input.value.startsWith("<math")) {
        inp = input.value.split("\n");  // ...process each line of input separately...
    } else {
        inp = [input.value];  // ...or treat the entire input as a UnicodeMath expression
    }

    // compile inputs and accumulate outputs
    var m_parse = [];
    var m_preprocess = [];
    var m_transform = [];
    var m_pretty = [];
    var output_HTML = "";
    var output_pegjs_ast_HTML = "";
    var output_preprocess_ast_HTML = "";
    var output_mathml_ast_HTML = "";
    var output_source_HTML = "";
    inp.forEach(val => {

        // ignore empty lines
        if (val.trim() == "") {
            return;
        }

        // tell the user that unicodemath delimiters aren't required if they've
        // used them
        if (val.includes("⁅") || val.includes("⁆")) {
            output_HTML += '<div class="notice">Note that the UnicodeMath delimiters ⁅⋯⁆ you\'ve used in the expression below aren\'t required – ' + (ummlConfig.splitInput? 'each line of the' : 'the entire') + ' input is automatically treated as a UnicodeMath expression.</div>';
        }

        // mathml output
        var mathml, details;
        ({mathml, details} = unicodemathml(val, ummlConfig.displaystyle));
        output_HTML += mathml;
        if (isMathML(input.value)) {
            output_source_HTML = MathMLtoUnicodeMath(input.value);
        } else {
            output_source_HTML += highlightMathML(escapeMathMLSpecialChars(indentMathML(mathml))) + "\n";
        }

        // show parse tree and mathml ast
        if (details["intermediates"]) {
            var pegjs_ast = details["intermediates"]["parse"];
            var preprocess_ast = details["intermediates"]["preprocess"];
            var mathml_ast = details["intermediates"]["transform"];

            output_pegjs_ast_HTML += highlightJson(details["intermediates"]["json"]) + "\n";
            output_preprocess_ast_HTML += highlightJson(preprocess_ast) + "\n";
            output_mathml_ast_HTML += highlightJson(mathml_ast) + "\n";
        }

        // tally measurements
        var extractMeasurement = name => parseInt(details["measurements"][name], 10);
        if (details["measurements"]) {
            m_parse.push(extractMeasurement("parse"));
            m_preprocess.push(extractMeasurement("preprocess"));
            m_transform.push(extractMeasurement("transform"));
            m_pretty.push(extractMeasurement("pretty"));
        }
    });

    // display measurements
    if (!testing) {
        var sum = a => a.reduce((a, b) => a + b, 0);
        measurements_parse.innerHTML = sum(m_parse) + 'ms';
        measurements_preprocess.innerHTML = sum(m_preprocess) + 'ms';
        measurements_transform.innerHTML = sum(m_transform) + 'ms';
        measurements_pretty.innerHTML = sum(m_pretty) + 'ms';
        if (m_parse.length > 1) {
            measurements_parse.title = m_parse.map(m => m + 'ms').join(" + ");
            measurements_preprocess.title = m_preprocess.map(m => m + 'ms').join(" + ");
            measurements_transform.title = m_transform.map(m => m + 'ms').join(" + ");
            measurements_pretty.title = m_pretty.map(m => m + 'ms').join(" + ");
        } else {
            measurements_parse.title = "";
            measurements_preprocess.title = "";
            measurements_transform.title = "";
            measurements_pretty.title = "";
        }
    }

    // write outputs to dom (doing this inside the loop becomes excruciatingly
    // slow when more than a few dozen inputs are present)
    // if mathjax is loaded, tell it to redraw math
    output.innerHTML = output_HTML;
    if (!testing) {
        output_pegjs_ast.innerHTML = output_pegjs_ast_HTML;
        output_preprocess_ast.innerHTML = output_preprocess_ast_HTML;
        output_mathml_ast.innerHTML = output_mathml_ast_HTML;
        output_source.innerHTML = output_source_HTML;
    }

    if (ummlConfig.forceMathJax) {
        try {
            MathJax.typeset([output])
        }
        catch { }
    }
}

input.focus()

// add a symbol (or string) to history
function addToHistory(symbols) {
    // remove previous occurrences of symbols from history
    hist = hist.filter(s => s != symbols);

    hist.push(symbols);
    localStorage.setItem('history', JSON.stringify(hist));

    displayHistory();
}

function displayHistory() {

    // don't overwhelm the browser
    var historySize = 50;

    //                  ↙ clone array before reversing
    var histo = hist.slice().reverse().slice(0,historySize).map(c => {

        // get tooltip data
        var t = "";
        if (symbolTooltips[c] != undefined && symbolTooltips[c] != "") {
            t = symbolTooltips[c];
        }

        return `<button class="unicode" data-tooltip="${t}">${c}</button>`;
    });
    document.getElementById('history').innerHTML = histo.join('');
}

function setActiveTab(id) {
    if (!document.getElementById(id) || !ummlConfig.debug)
        id = activeTab

    Array.from(document.getElementsByClassName('tab')).map(t => t.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    Array.from(document.querySelectorAll(".tabcontent pre")).map(p => p.style.display = "none");
    document.getElementById("output_" + id).style.display = "block";

    window.localStorage.setItem('active_tab', id);
}

$(input).on("change keyup paste", function() {
    draw();
})

$('button.tab').click(function () {
    setActiveTab(this.id);
})

// because the history is updated after page load, which kills any
// previously defined event handlers, we can't simply do
// "$('.button').click(...)"
$(document).on('click', function (e) {
    if ($(e.target).hasClass('unicode')) {
        let str = e.target.innerText;

        if (str.length > 4) {
            // Must be an example. Determine index of example for use with
            // next Alt + Enter hot key
            let x = document.getElementById('Examples').childNodes[0];
            let cExamples = x.childNodes.length;

            for (iExample = 0; iExample < cExamples; iExample++) {
                if (str == x.childNodes[iExample].innerText)
                    break;
            }
            iExample++;
            if (iExample > cExamples)
                iExample = 0;
            input.value = str;
            input.focus();
            draw();
            if (demoID)
                endDemo();
            return;
        }
        addToHistory(e.target.innerText);
        insertAtCursorPos(str);
    }
})

// custom codepoint insertion
$('#codepoint').keypress(function (e) {
    let key = e.which;
    if (key == 13) {  // enter
        $('button#insert_codepoint').click();
    }
});
$('button#insert_codepoint').click(function () {
    let symbol = String.fromCodePoint("0x" + $('#codepoint').val())
    insertAtCursorPos(symbol);
    addToHistory(symbol);
})

// custom control word insertion. call resolveCW() in unicodemathml.js
$('#controlword').keydown(function (e) {
    $('#controlword').css('color', 'black');
});
$('#controlword').keypress(function (e) {
    let key = e.which;
    if (key == 13) {  // enter
        $('button#insert_controlword').click();
    }
})

$('button#insert_controlword').click(function () {
    var cw = $('#controlword').val();
    var symbol = resolveCW(cw);

    if (symbol[0] == '\"') {
        // control word not found; display it as is
        symbol = cw;
    } else {
        addToHistory(symbol);
    }
    speak(symbol)
    insertAtCursorPos(symbol);
})

$('button#insert_dictation').click(function () {
    var dictation = $('#dictation').val();
    try {
        var unicodeMath = dictationToUnicodeMath(dictation);
        insertAtCursorPos(unicodeMath);
    }
    catch {
        alert('Math dictation is unavailable');
    }
})

$('#dictation').keydown(function (e) {
    if (e.key == 'Enter') {
        // Prevent form from being submitted and simulate a click on the
        // dictation button
        e.preventDefault();
        $('button#insert_dictation').click();
    }
})

// math font conversion (mathFonts[] is defined in unicodemathml.js)
$('#mathchar').on("change keyup paste", function (e) {
    $('.mathfont').removeClass("disabled");

    var char = mathchar.value;
    var code = char.codePointAt(0);
    var anCode = '';

    if (code >= 0x2102) {
        [anCode, char] = foldMathAlphanumeric(code, char);
    }
    if (char == "") {
        return;
    }
    code = char.codePointAt(0);
    mathchar.value = char = char.substring(0, code > 0xFFFF ? 2 : 1);  // Max of 1 char

    var fonts;
    try {
        fonts = Object.keys(mathFonts[char]);
    } catch (e) {
        fonts = [];
    }

    $('.mathfont').each(function () {
        if (this.id != 'mup' && !(fonts.includes(this.id))) {
            $(this).addClass("disabled");
        }
    });
})

function getInputSelection() {
    let s = input.selectionStart

    if (s || s == '0') {
        let e = input.selectionEnd
        if (s != e)
            return input.value.substring(s, e)
    }
    return null                             // no selection
}

$('button.mathfont').click(function () {
    var font = this.id;

    var char = $('#mathchar').val();
    if (char != "") {
        var symbol = char;
        if (font != 'mup') {
            try {
                symbol = mathFonts[char][font];
                if (symbol == undefined) {
                    throw undefined;
                }
            } catch (e) {
                return;
            }
        } else {
            // Quote symbol unless selection is inside a quoted string. Note
            // that \mup... should map to mi mathvariant=normal rather than
            // mtext. Probably need an input string parallel to input.value
            // to track this and maybe other properties as in OfficeMath.
            // Also code doesn't currently handle selecting part way into
            // a quoted string.
            var symbolSave = symbol;

            for (var iOff = 0;; ) {
                var iQuote = input.value.indexOf('"', iOff);
                var iQuoteClose = input.value.indexOf('"', iQuote + 1);

                if (iQuote == -1 || iQuoteClose == -1 || iQuote > input.selectionEnd ||
                    input.selectionStart <= iQuote && input.selectionEnd > iQuoteClose) {
                    symbol = '"' + symbol + '"';
                    break;                  // Selection not inside quotes or contains quotes
                }
                if (iQuote == input.selectionStart) {
                    input.selectionStart++; // Move symbol inside quotes
                    break;
                }
                if (iQuote == input.selectionStart - 1)
                    break;                  // Insert symbol inside quotes

                iOff = iQuoteClose + 2;
                if (input.selectionStart >= iOff)
                    continue;               // Selection might be inside a later quoted string

                if (input.selectionEnd == iQuoteClose)
                    break;                  // Insert symbol inside quotes

                if (input.selectionEnd == iQuoteClose + 1) {
                    input.selectionEnd--;   // Move symbol inside quotes
                    break;
                }
            }
        }
        insertAtCursorPos(symbol);
        addToHistory(symbolSave);
    } else if (input.selectionStart != input.selectionEnd) {
        // if no character entered, try converting nondegenerate selection
        var symbols = '';
        var chars = getInputSelection();

        for (var i = 0; i < chars.length; i++) {
            var code = chars.codePointAt(i);
            var ch = chars[i];
            var chFolded = ch;
            var anCode = 0;

            if (code >= 0x2102) {           // Letterlike symbols or beyond
                if (code > 0xFFFF) {
                    ch = chars.substring(i, i + 2);
                    i++;
                }
                [anCode, chFolded] = foldMathAlphanumeric(code, ch);
            }
            if (font == 'mup') {
                symbols += chFolded;
            } else {
                symbols += (chFolded in mathFonts && font in mathFonts[chFolded])
                    ? mathFonts[chFolded][font] : ch;
            }
        }
        insertAtCursorPos(symbols);
        input.selectionStart -= symbols.length;
        input.focus();
        draw();
    }
})

// button tooltips
function showTooltip(x, y, text) {
    if (text != null && text != "") {
        $(document.body).append($('<div class="tooltip" style="left: ' + x + 'px; top: ' + y + 'px;">' + text + '</div>'));
    }
}
function hideTooltip() {
    $(".tooltip").remove();
}
$('button').hover(function (e) {
    var elem = this;
    var x = $(elem).offset().left;
    var y = $(elem).offset().top + $(elem).outerHeight(true) + 1;
    var text = elem.getAttribute("data-tooltip");
    showTooltip(x, y, text);
}, hideTooltip);

$('#codepoints').on('mouseover', '.cp', function (e) {
    var elem = this;
    var x = $(elem).offset().left + 0.3 * $(elem).outerWidth(true) + 10;
    var y = $(elem).offset().top + 0.8 * $(elem).outerHeight(true);
    var text = elem.getAttribute("data-tooltip");
    showTooltip(x, y, text);
});
$('#codepoints').on('mouseout', '.cp', hideTooltip);

// explanatory tooltips
$('[data-explanation]').hover(function (e) {
    if (window.innerWidth < 768)            // Hover doesn't work on small devices
        return;
    var elem = this;
    var x = $(elem).offset().left;
    var y = $(elem).offset().top + $(elem).outerHeight(true) + 1;
    var text = elem.getAttribute("data-explanation");
    showTooltip(x, y, text);
}, hideTooltip);

var recognition
try {
    dictationToUnicodeMath('')              // Fails if dictation.js is unavailable
    initDictation()
}
catch { }

function beep(frequency) {
    // Create an AudioContext and oscillator node
    let audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    oscillator.connect(audioContext.destination)
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.2); // Stop after 0.1 seconds
}

function initDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition)
        return

    recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = true

    recognition.onresult = function (event) {
        if (event.results.length > 0) {
            var current = event.results[event.results.length - 1][0];
            var result = current.transcript;
            console.log(result);
            result = dictationToUnicodeMath(result);
            var result1 = '';
            var ch = '';
            var chPrev;

            // Convert ASCII and lower-case Greek letters to math italic
            // unless they comprise function names
            for (var i = 0; i < result.length; i++) {
                chPrev = ch;
                ch = result[i];
                if (isLcAscii(ch) || isUcAscii(ch)) {
                    for (var j = i + 1; j < result.length; j++) {
                        if (!isLcAscii(result[j]) && !isUcAscii(result[j]))
                            break;
                    }
                    if (result[j] == '\u2061') { // Function name?
                        result1 += result.substring(i, j);
                    } else {
                        result1 += italicizeCharacters(result.substring(i, j))
                    }
                    i = j - 1;
                } else {
                    ch = italicizeCharacter(ch);     // Might be lc Greek
                    if (ch == result[i]) {           // Isn't
                        if (result.length > i + 1) { // Convert eg '^2 ' to '²'
                            var delim = result.length > i + 2 ? result[i + 2] : ' ';
                            var chScriptDigit = getSubSupDigit(result, i + 1, delim);
                            if (chScriptDigit) {
                                result1 += chScriptDigit;
                                i += (delim == ' ' && result.length > i + 2) ? 2 : 1;
                                continue;
                            }
                        }
                        if (result.length > i + 2 && isAsciiDigit(ch) &&
                            result[i + 1] == '/' && isAsciiDigit(result[i + 2]) &&
                            !isAsciiDigit(chPrev) && (result.length == i + 3 ||
                            !isAlphanumeric(result[i + 3]))) {
                            // Convert, e.g., 1/3 to ⅓
                            ch = getUnicodeFraction(ch, result[i + 2]);
                            i += 2;
                        }
                    }
                    result1 += ch;
                }
            }
            insertAtCursorPos(result1);
            speechDisplay.innerText += current.transcript
        }
    }
    recognition.onerror = function (event) {
        startDictation()
        alert((event.error == 'network') ? 'Not connected to Internet'
            : `Dictation recognition error detected: ${event.error}`);
    }

    recognition.onaudiostart = function (event) {
        console.log('Audio start')
        dictateButton.style.backgroundColor = 'DodgerBlue'
        beep(1000)
    }

    recognition.onaudioend = function (event) {
        console.log('Audio end')
        dictateButton.style.backgroundColor = 'inherit'
        dictateButton.style.color = 'inherit'
        beep(900)
    }
}

function startDictation() {
    if (recognition == undefined) {
        alert("dictation recognition API not available");
        return;
    }
    let dictate = document.getElementById('dictation')

    if (dictateButton.style.backgroundColor != 'DodgerBlue') {
        try {
            recognition.start()
            speechDisplay.innerText = ''
            input.value = ''
            return
        }
        catch (error) { }
    }
    recognition.stop()                  // Already started
}
