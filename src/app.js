import { viewportWidth, viewportHeight } from "./utils";
import './app.css';
import { append_classifiers_list } from "./selection_list";
import { createChart } from "./scatter_plot"
import { add_oeb_credits } from "./scatter_plot"
import { compute_chart_height } from "./scatter_plot"
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { save as save_svg } from 'd3-save-svg';
import * as d3 from "d3";
// d3-transition patches selection.prototype.transition as a side effect; import it explicitly,
// otherwise tree shaking drops it (d3 is marked side-effect free)
import "d3-transition";
import { isEmptyElement } from "./utils";

// build with `npm run prod` (or `npm run dev` to watch)


let MAIN_DATA = {};
let MAIN_METRICS = {};
let better = {};


function load_scatter_visualization() {


    let divid;

    let charts = document.getElementsByClassName("benchmarkingChart_scatter");

    let i = 0;
    let dataId;
    let y;

    // append ids to chart/s and make d3 plot
    i = 0
    for (y of charts) {

        // ********* DEPRECATED ******
        // Please supply data-api-url parameter
        // ***************************
        // define base url - production or development --- DEPCRECATED
        //check for mode by default it is production if no param is given
        var mode = y.dataset.mode ? y.dataset.mode : "openebench"
        let base_url = "https://" + mode + ".bsc.es/";
        // **************************

        const api_url = y.dataset.apiUrl
        let url = api_url ? api_url : base_url + "sciapi/graphql"; //downward compatibility

        // get benchmarking event id
        dataId = y.getAttribute('data-id');

        //set chart id
        divid = (dataId + i).replace(":", "_");
        y.id = divid;

        //append selection list
        append_classifiers_list(divid);

        let json_query = `query getDatasets($dataset_id: String!){
                          getDatasets(datasetFilters:{id: $dataset_id, type:"aggregation"}) {
                              _id
                              name
                              description
                              type
                              orig_id
                              community_ids
                              datalink{
                                  inline_data
                              }
                              challenge_ids
                              dataset_contact_ids
                              dates {
                                creation
                                modification
                                public
                              }
                              depends_on {
                                metrics_id
                                tool_id
                                rel_dataset_ids {
                                    dataset_id
                                }
                              }
                             
                          }
                        }`

        get_data(url, json_query, dataId, divid);


        //check the transformation to table attribute and append table to html
        if (y.getAttribute('toTable') == "true") {
            let table_id = divid + "_table";
            let table = document.createElement("table");
            table.id = table_id;
            table.dataset.id = dataId;
            table.className = "benchmarkingTable_scatter";
            document.getElementById(divid + "flex-container").append(
                document.createElement("br"), document.createElement("br"), table);
        };

        i++;
    }



};



// minimal replacement for apollo-fetch: POST a GraphQL query, resolve with the parsed JSON response
function graphql_client(url) {
    return function({ query, variables }) {
        return fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ query: query, variables: variables || {} }),
        }).then(res => {
            if (!res.ok) {
                throw new Error(`GraphQL request to ${url} failed: ${res.status} ${res.statusText}`);
            }
            return res.json();
        });
    };
}

function get_data(url, json_query, dataId, divid) {

    try {

        const query_api = graphql_client(url);

        let vars = { dataset_id: dataId };

        query_api({
            query: json_query,
            variables: vars,
        }).then(res => {
            let result = res.data.getDatasets;
            if (result.length == 0) {

                document.getElementById(divid + "_dropdown_list").remove();

                var para = document.createElement("td");
                para.id = "no_benchmark_data"
                var err_txt = document.createTextNode("No data available for the selected challenge: " + dataId);
                para.appendChild(err_txt);
                var element = document.getElementById(divid);
                element.appendChild(para);

            } else {

                // get the names of the tools that are present in the community
                const fetchData = () => query_api({
                    query: `query getMetrics{
                        getMetrics {
                          _id
                          title
                          _metadata
                          representation_hints
                        }
                    }`
                });

                fetchData().then(response => {

                    let metrics_list = response.data.getMetrics;
                    // iterate over the list of metrics to generate a dictionary
                    let metrics_names = {};
                    metrics_list.forEach(function(element) {
                        // parsing GraphQL wrapped JSON Object
                        try {
                            element._metadata = JSON.parse(element._metadata);
                        } catch (err) {
                            console.warn (err);
                        }
                        metrics_names[element._id] = element.title
                        if (element._metadata != null && "level_2:metric_id" in element._metadata) {
                            metrics_names[element._metadata["level_2:metric_id"]] = element.title

                        }
                    });

                    // parsing GraphQL wrapped JSON Object
                    if (typeof result[0].datalink.inline_data === "string") {
                        try {
                            result[0].datalink.inline_data = JSON.parse(result[0].datalink.inline_data);
                        } catch (err) {
                            console.warn(err);
                        }
                    }

                    // get optimization point
                    if (result[0].datalink.inline_data.visualization.optimization == "bottom-right") {
                        better[divid] = "bottom-right";
                    } else if(result[0].datalink.inline_data.visualization.optimization == "top-right"){
                        better[divid] = "top-right";
                    } else if(result[0].datalink.inline_data.visualization.optimization == "top-left"){
                        better[divid] = "top-left";
                    }
                    let metric_x = result[0].datalink.inline_data.visualization.x_axis;
                    let metric_y = result[0].datalink.inline_data.visualization.y_axis;
                    // append those metrics as div attributes, so that they cna be used later
                    document.getElementById(divid).setAttribute("metric_x", metric_x);
                    document.getElementById(divid).setAttribute("metric_y", metric_y);
                    join_all_json(result, divid, metric_x, metric_y, metrics_names, better);

                });

            };
        }).catch(err => {
            console.error(`Cannot load data for ${dataId}: ${err}`);
        });

    } catch (err) {
        console.log(`Invalid Url Error: ${err.stack} `);
    }

};



function join_all_json(result, divid, metric_x, metric_y, metrics_names, better) {
    try {

        // transform the object to an array, which is usable by the D3 chart
        let full_json = [];
        result[0].datalink.inline_data.challenge_participants.forEach(function(element) {

            //if participant name is too long, slice it
            let tool_name = element.tool_id;
            var short_name;
            if (tool_name.length > 22) {
                short_name = tool_name.substring(0, 22);
            } else {
                short_name = tool_name
            }

            let jo = {};
            jo['toolname'] = short_name;
            if (element.metric_x == 999999 && element.metric_x == 999999){
                element.metric_x = NaN; element.stderr_x = NaN;
            }
            if (element.metric_y == 999999 && element.metric_y == 999999){
                element.metric_y = NaN; element.stderr_y = NaN;
            }
            jo['x'] = element.metric_x;
            jo['y'] = element.metric_y;
            jo['e_y'] = element.stderr_y ? parseFloat(element.stderr_y) : 0;
            jo['e_x'] = element.stderr_x ? parseFloat(element.stderr_x) : 0;
            full_json.push(jo);

        });
        full_json.sort(function(a, b) {
            let x = a.toolname.toLowerCase();
            let y = b.toolname.toLowerCase();
            if (x < y) { return -1; }
            if (x > y) { return 1; }
            return 0;
        });

        MAIN_DATA[divid] = full_json;
        MAIN_METRICS[divid] = metrics_names;
        // by default, no classification method is applied. it is the first item in the selection list
        var e = document.getElementById(divid + "_dropdown_list");
        let classification_type = e.options[e.selectedIndex].id;

        // add buttons
        add_buttons(divid, metric_x, metric_y, better, full_json, result[0]);
        let axis_limit;
        if (document.getElementById(divid + "axis_button").name == "optimal view") {
            axis_limit = 0;
        } else {
            axis_limit = "auto"
        }

        createChart(full_json, divid, classification_type, metric_x, metric_y, metrics_names, better, axis_limit);
    } catch (err) {
        console.log(`Invalid Url Error: ${err.stack} `);
    }


};

function add_buttons(divid, metric_x, metric_y, better, data, json_download) {
    // load default zoom state from div attribute 'default-zoom'
    let default_zoom = document.getElementById(divid).getAttribute('default-zoom');
    default_zoom = (default_zoom && (default_zoom === 'on' || default_zoom === 'true'));

    //add button which allows to toogle between reset view & out
    d3.select('#' + divid + '_buttons_container').append("div").attr("class", "toggle_div")
        .append("label").lower().attr("for", divid+"axis_button").text("Axes scale: ")
        .append("button")
        .attr("class", "toggle_axis_button")
        .attr("id", divid + "axis_button")
        .attr("name", default_zoom ? "reset view" : "optimal view")
        .text(default_zoom ? "reset view" : "optimal view")
        .on('click', function() {
            if (this.name == "optimal view") {
                d3.select(this).text("reset view");
                this.name = "reset view"
                    //the chart will be created again, but first it needs to know which classification method is selected
                let select_list = document.getElementById(divid + "_dropdown_list")
                onQuartileChange(select_list.options[select_list.selectedIndex].id, metric_x, metric_y, better)

            } else {
                d3.select(this).text("optimal view");
                this.name = "optimal view"
                    //the chart will be created again, but first it needs to know which classification method is selected
                let select_list = document.getElementById(divid + "_dropdown_list")
                onQuartileChange(select_list.options[select_list.selectedIndex].id, metric_x, metric_y, better);
            }
        });

    // add options button to download chart in pdf or png format
    let select_list = d3.select("#" + divid + "_buttons_container").append("div").attr("class", "download_div").append("form")
        .append("label").attr("for", divid+"_download_button").text("Download: ")
        .append("select")
        .attr("class", "download_button")
        .attr("id", divid + "_download_button")
        .on('change', function() {

            // add the oeb logo, for download, which will be removed after the download function is completed
            if (window.location.href.toLocaleLowerCase().includes("openebench") == true ){
                let margin = {top: Math.round(viewportHeight()* 0.0318), right:  Math.round(viewportWidth()* 0.0261), bottom: compute_chart_height(data), left:  Math.round(viewportWidth()* 0.0373)}
                add_oeb_credits(divid, d3.select('#' + divid +"_g_svg"), margin);
              }

            download_file(this.options[this.selectedIndex].id, divid, json_download);
            let select_list = document.getElementById(divid + "_download_button");
            select_list.value = "Download";
            if (window.location.href.toLocaleLowerCase().includes("openebench") == true ){
                document.getElementById(divid + "_logo_container").remove();
                document.getElementById(divid + "_logo").remove();
            };

        })
        .append("optgroup")
        .attr("label", "Select a format: ");


    select_list.append("option")
        .attr("value", "Download")
        .attr("disabled", "selected")
        .text("Download")
        .attr("style", "display: none");

    select_list.append("option")
    .attr("class", "selection_option")
    .attr("id", "json")
    .attr("title", "Download raw data as JSON")
    .attr("data-toggle", "list_tooltip")
    .attr("data-container", "#tooltip_container")
    .text("JSON (raw data)")

    select_list.append("option")
        .attr("class", "selection_option")
        .attr("id", "png")
        .attr("title", "Download plot as PNG")
        .attr("data-toggle", "list_tooltip")
        .attr("data-container", "#tooltip_container")
        .text("PNG")
    select_list.append("option")
        .attr("class", "selection_option")
        .attr("id", "pdf")
        .attr("title", "Download plot as PDF")
        .attr("data-toggle", "list_tooltip")
        .attr("data-container", "#tooltip_container")
        .text("PDF")
    select_list.append("option")
        .attr("class", "selection_option")
        .attr("id", "svg")
        .attr("title", "Download plot as SVG")
        .attr("data-toggle", "list_tooltip")
        .attr("data-container", "#tooltip_container")
        .text("SVG (only plot)")

}

function download_file(format, id, json_download) {

    var download_id;
    if (isEmptyElement(id + "_table")) {
        download_id = id + "_svg_container"
    } else {
        download_id = id + "flex-container"
    }
    //save window' current scroll, as the html2canvas library needs to scroll up to the top right corner
    let scrollPos = [window.pageXOffset, window.pageYOffset]
    window.scrollTo(0, 0);
    if (format == "svg") {

        saveAsSVG(id);
    } else if (format == "json") {
        var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(json_download, undefined, 2));
        var downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href",     dataStr);
        downloadAnchorNode.setAttribute("download", "raw_data_" + id + ".json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    } else {

        html2canvas(document.querySelector("#" + download_id)).then(function(canvas) {

            if (format == "pdf") {
                saveAsPDF(id, canvas.toDataURL(), 'benchmarking_chart_' + id + '.pdf');
            } else if (format == "png") {
                saveAsPNG(canvas.toDataURL(), 'benchmarking_chart_' + id + '.png')
            }

        });
    }


    window.scrollTo(scrollPos[0], scrollPos[1]);

}

function saveAsPDF(id, uri, filename) {

    var doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        // format: [750, 1200]
    })
    let width;
    let height = doc.internal.pageSize.getHeight();
    if (isEmptyElement(id + "_table")) {
        width = doc.internal.pageSize.getWidth();
    } else {
        width = doc.internal.pageSize.getWidth() + doc.internal.pageSize.getWidth() * 0.2126; // this value might change when it is used as a widget in a different website (oeb - 0.02)
    }
    doc.addImage(uri, 'PNG', 5, 5, width, height);
    doc.save(filename);

}

function saveAsPNG(uri, filename) {

    var link = document.createElement('a');

    if (typeof link.download === 'string') {

        link.href = uri;
        link.download = filename;

        //Firefox requires the link to be in the body
        document.body.appendChild(link);

        //simulate click
        link.click();

        //remove the link when done
        document.body.removeChild(link);

    } else {

        window.open(uri);

    }
}

function saveAsSVG(id) {

    var download_id = "svg_" + id;
    var name = 'benchmarking_chart_' + id;

    save_svg(d3.select('#' + download_id).node(), { filename: name });
}

function onQuartileChange(ID, metric_x, metric_y, better, axis_limit = "auto") {

    var chart_id = ID.split("__")[0];
    // console.log(d3.select('#'+'svg_'+chart_id));
    d3.select('#' + 'svg_' + chart_id).remove();
    let classification_type = ID;

    var axis_limit;
    if (document.getElementById(chart_id + "axis_button").name == "optimal view") {
        axis_limit = 0;
    } else {
        axis_limit = "auto"
    }

    createChart(MAIN_DATA[chart_id], chart_id, classification_type, metric_x, metric_y, MAIN_METRICS[chart_id], better, axis_limit);

};


export {
    load_scatter_visualization,
    onQuartileChange,
    better
}

load_scatter_visualization();