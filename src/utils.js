// Small DOM helpers replacing the jQuery calls used previously.

// same as jQuery's $(window).width() / $(window).height(): viewport size without scrollbars
export function viewportWidth() {
    return document.documentElement.clientWidth;
}

export function viewportHeight() {
    return document.documentElement.clientHeight;
}

// same as jQuery's $("#" + id).is(":empty"): false if the element does not exist
export function isEmptyElement(id) {
    const el = document.getElementById(id);
    return el !== null && el.childNodes.length === 0;
}

// normalized participant name used in the list of hidden tools
export function toolKey(toolname) {
    return toolname.replace(/[\. ()+/_]/g, "-");
}
