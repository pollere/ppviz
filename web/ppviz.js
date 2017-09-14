//  Copyright (c) 2017 Pollere, Inc. All rights reserved.

'use strict';

//delay map margins
const margin = {
    top: 10,
    right: 40,
    bottom: 50,
    left: 80
};
//colors for stripchart (limit to four)
const lineColor = [
	"rgb(0, 109, 210)",
	"rgb(0, 0, 0)",
	"rgb(0, 0, 0)",
	"rgb(0, 146, 146)"
	]
const laneHtMin = 70;
const popHtMin = 160;
const iVal = [];
const laneNo = [];
let width, height;
let mapHt;
let minSpaceBelow;
let freeRun = +0;
let curStrt;	        //start of current stat display interval in data time
let cleanUpInt;         //use to track when to clean out old samples
let lstTm = +0;	            //time of last sample read
let maxIdle = 600.;     //delete flow state if idle longer 
let ptHistory = 600.;	//keep points this long
let updateInterval = 1.; //basic update interval, use for strip charts
let statInterval;       //seconds into the past for short-term boxes,
                        // box plot region update interval
let newDispInt;
let svg, boxg;
let xScale, yScale, xAxis;
let popped = [];
let popHt = +0;
let laneNm = [];	    //lane's flow name by id number
let startscale;
let dwAutoscale = +1;
let guide = +1;
let vDisp = 10;
let vDispMax = 10;
let maxV = [10., 50.];  //use to keep extent of xScale domain (in msec)
let dispCnt = +0, dispInt = 0.;
let intervalLabel, dateLabel;
let windowHt;
let sleepTm = +0.;     //in ms, use in freeRun/animation
const statHistSelections = [];
const dispList = [];
const unDispList = [];
let selectStreams = false;      //indicator for a sorted dispList or check box selected
let plotDiv = document.getElementById("plot");
let stripLast;		    //last time strip chart was updated
let pauseStrip = false;
let stripSp = 0.03;
let stripSubMax = 6;

function resizeMap() {
    d3.select("#map svg").remove();
    d3.select("#header svg").remove();
    d3.select("#resizer svg").remove();
    svg.selectAll(".laneShadow").remove();
    initCanvas();	    //resizing height can change number of lanes
    assignLanes();	    //have to reassign lanes then update canvas
    computeLaneBoxes();
    updateCanvas(0);
    //if there's an active stripchart popup, redraw to fit
    if(plotDiv.children.length) {
    	popHt = window.innerHeight
		    - (document.getElementById("resizer").getBoundingClientRect().bottom
		    + document.getElementById("guide").clientHeight + 35
		    + d3.select("footer").node().getBoundingClientRect().height);
    	popHt = popHt > popHtMin ? popHt : popHtMin;
	    let update = {
		    height: popHt,
		    width: width+margin.left
	    };
	    Plotly.relayout('plot', update);
    	d3.select("#closer svg")
		    .attr("height", popHt)
        	.attr("width", margin.right/2)
		    .attr("x", 0)
		    .attr("y", 0)
        	.style("pointer-events", "all");
        let ph = document.getElementById("closer").getBoundingClientRect().height;
        let b = (ph - 40)/subs; //spacing between closers
        //move closers vertically to match bottom of subplot
        for(let s=1; s<=subs; s++) {
            let h = (subs - (s-1))*b;
            d3.select("#spcbox" + s).attr("y", h);
            d3.select("#spctxt" + s).attr("y", h+9);
        }
    }
}

function initCanvas() {
    width = document.getElementById("map").clientWidth;
    windowHt = window.innerHeight;
    intervalLabel = d3.select("#intSummary");
    dateLabel = d3.select("#dateTime");
    if(lstTm > 0)   {
        //only set a date if there have been ppLines seen
        //set to time for this data
        dateLabel.text(() => { return new Date(lstTm*1000); });
    }
    statInterval = 10*updateInterval;
    //subtract fixed elements, include 15 for spacing and 18 for resizer
    height = windowHt - (document.getElementById("header").clientHeight
	    + document.getElementById("guide").clientHeight + 35 + popHt
	    + d3.select("footer").node().getBoundingClientRect().height);
    //height for the delay topology map
    mapHt = height - margin.top - margin.bottom;
    if(vDisp*laneHtMin > mapHt) {
	    vDisp = Math.trunc(mapHt/laneHtMin);
	    if(vDisp < 1)
		    vDisp = 1;
    }
    mapHt = vDisp * laneHtMin;
    height = mapHt + margin.top + margin.bottom;
    d3.select("#map").style("height", height);
    svg = d3.select("#map").append("svg:svg")
        .attr("width", width)
        .attr("height", height)
        .style("pointer-events", "none")
        .append("g")
        .attr("transform",
            "translate(" + margin.left + "," + margin.top + ")");
    height = mapHt;
    //width for the delay topology map
    width = width - margin.left - margin.right;
    xScale = d3.scaleLinear().range([0, width]).domain([-maxV[0], maxV[1]]);
    yScale = d3.scaleLinear().range([0, height]).domain([0, vDisp]);
    xAxis = d3.axisBottom(xScale)
        .tickSize(-height)
        .tickFormat(d => Math.abs(d));
    //create a shaded rectangle for each even numbered lane
    for (let i = 0; i < vDisp; i++)
        if (i % 2 === 0) {
            svg.append("rect")
            .attr("class", "laneShadow")
            .attr("x", -margin.left)
            .attr("y", d => yScale(i))
            .attr("height", laneHtMin)
            .attr("width", width + margin.left + margin.right)
            .attr("fill", "green")
            .style("opacity", .1);
        }

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis);
    svg.append("text")
        .attr("class", "cplabel")
        .attr("x", xScale(0))
        .attr("y", height + 30)
        .attr("text-anchor", "middle")
        .attr("stroke", "green")
        .attr("font-size", "10pt")
        .text("Capture Point");
    svg.append("line")
        .attr("class", "cpline")
        .attr("stroke", "green")
        .attr("stroke-width", 3)
        .attr("x1", xScale(0))
        .attr("y1", yScale(0))
        .attr("x2", xScale(0))
        .attr("y2", height + yScale(0));
    svg.append("text")
        .attr("x", width + 0)
        .attr("y", height + 30)
        .attr("font-size", "8pt")
        .attr("text-anchor", "end")
        .text("ms from CP");
    svg.append("clipPath")
        .attr("id", "viewClip")
        .append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("height", height)
        .attr("width", width)
        .attr("fill", "none");
    boxg = svg.append("g")
        .attr("clip-path", "url(#viewClip)");
    svg.append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("height", height)
        .attr("width", width)
        .style("fill", "none")
        .style("pointer-events", "all")
	.on("click", stripChart)
        .call(d3.zoom()
            .scaleExtent([.1,10])
            .on("start", zoomstart)
            .on("zoom", zoomed));
    d3.select("#resizer")
	    .append("svg")
	    .attr("height", 10)
        .attr("width", width+margin.right+margin.left)
        .style("background", "gray")
        .style("pointer-events", "drag")
    	.call(d3.drag()
	        .on("start", function () {
		        minSpaceBelow = document.getElementById("guide").clientHeight + 15
			        + d3.select("footer").node().getBoundingClientRect().height;
                if(plotDiv.children.length)
			        minSpaceBelow += (popHtMin + 15);
	        })
	        .on("drag", dragged)
	        .on("end", vertResize) );

    // lanes available for display
    laneNm = [];
    for (let h in laneNo)	//clear out all the assigned lanes
	    delete laneNo[h];
    iVal.splice(0);
    for (let i = 1; i <= vDisp; i++)
	    iVal.push(i);
}

function dragged() {
    let nb = d3.event.sourceEvent.pageY;
    let nh = nb - (10 + document.getElementById("map").getBoundingClientRect().top);
    //need room for at least one box plot lane
    if(nh <  laneHtMin + margin.top + margin.bottom) {
	    nh =  laneHtMin + margin.top + margin.bottom;
    } else if(nb > window.innerHeight - minSpaceBelow) {
    	//don't move if strip chart gets compressed
	    nh -= nb - (window.innerHeight - minSpaceBelow);
	    nb = window.innerHeight - minSpaceBelow;
    }
    d3.select("#map").style('height', nh + 'px');
}

function vertResize() {
    if(plotDiv.children.length) {
    	let ph = window.innerHeight
		    - (document.getElementById("resizer").getBoundingClientRect().bottom
		    + document.getElementById("guide").clientHeight + 35
		    + d3.select("footer").node().getBoundingClientRect().height);
    	if(ph <= popHtMin) {
	        let nh = document.getElementById("map").clientHeight
			    - (popHtMin - ph);
    	    d3.select("#map").style('height', nh + 'px');
	        ph = popHtMin;
	        alert("ppViz at minimum strip chart height");
    	}
        if(ph != popHt) {
            //resize plot area (in case don't resizeMap)
            popHt = ph;
	        Plotly.relayout( document.getElementById("plot"), {height: popHt});
    	    d3.select("#closer svg")
		        .attr("height", popHt)
		        .attr("y", 0)
        	    .style("pointer-events", "all");
            let b = (ph - 40)/subs; //spacing between closers
            //move closers vertically to match bottom of subplot
            for(let s=1; s<=subs; s++) {
                let h = (subs - (s-1))*b;
                d3.select("#spcbox" + s).attr("y", h);
                d3.select("#spctxt" + s).attr("y", h+9);
            }
        }
    }
    let nHt = document.getElementById("map").clientHeight
	    - (margin.top + margin.bottom);
    if (nHt <= laneHtMin) {
	    alert("ppViz at minimum box plot height");
	    popHt = document.getElementById("map").getBoundingClientRect().top
		    + laneHtMin + margin.top + margin.bottom + 10
		    + document.getElementById("guide").clientHeight + 15
		    + d3.select("footer").node().getBoundingClientRect().height;
	    nHt = laneHtMin;
    }
    let l = Math.trunc(nHt/laneHtMin) < 1 ? 1 : Math.trunc(nHt/laneHtMin);
    if(l != vDisp) {
	    vDisp = l;
        resizeMap();
    }
}

function zoomstart() {
    if (dwAutoscale) {
        startscale = xScale.copy();
        this.__zoom = d3.zoomIdentity;
    }
}

function zoomed() {
    let t = d3.event.transform.rescaleX(startscale).domain();
    xScale.domain(t);
    autoScaleOff();
}

//conversion for data time to date/display time
function t2d(v) {
    return 1000*v;
}

//chart/trace just toggles off and on on click
function stripChart() {
    let hl = d3.event.pageX;
    let vl = d3.event.pageY;
    hl -= margin.left;
    vl -= document.getElementById("header").clientHeight + margin.top;
    let i = Math.trunc( yScale.invert(vl) );
//    let s = (xScale.invert(hl) < 0 ? 0 : 1);
    let f = laneNm[i];
    if(!f)
        return;             //no flow assigned to lane
    if(!flows[f])	{       //if flow is leaving?
	    alert("No record for flow" + f);
	    return;
    }
    if(flows[f].strip >= 0) {	    //already being displayed
	    return;
    }
    if(subs >= stripSubMax)      //current limit on subplots
		return;
    if(plotDiv.children.length) {
        addStripStream(f);        //set up the trace for this stream
	    return;
    }

    //initialize everything if there's currently no pop up chart
    //first flow of a new chart: set up popUp and stripchart
    //popHt has to be set correctly 
    let d = new Date(0);        //hack to make initial hours read 00
    stripLast = curStrt + dispInt - statInterval;
    if(stripLast < 0)
        stripLast = +0;
    popHt = window.innerHeight
	    - (document.getElementById("resizer").getBoundingClientRect().bottom
	    + document.getElementById("guide").clientHeight + 35
	    + d3.select("footer").node().getBoundingClientRect().height);
    popHt = popHt > popHtMin ? popHt : popHtMin;
    d3.select("#closer").append("svg")
	    .attr("height", popHt)
        .attr("width", margin.right/2)
        .style("pointer-events", "all")
	    .append("rect")
	    .attr("x", 0)
	    .attr("y", 0)
	    .attr("height", 20)
        .attr("width", 20)
        .style("fill", "gray")
	    .on("click", removeStripChart);
    d3.select("#closer svg")
	    .append("text").text("X")
	    .attr("x", 10)
	    .attr("y", 15)
        .attr("font-size", "12pt")
        .attr("stroke", "black")
        .style("pointer-events", "none")
        .style("text-anchor", "middle");
    d3.select("#closer svg")
	    .append("rect")
	    .attr("x", 0)
	    .attr("y", 25)
	    .attr("height", 20)
        .attr("width", 20)
        .style("fill", "gray")
        .style("pointer-events", "all")
	    .on("click", togglePause);
    d3.select("#closer svg")
	    .append("text")
        .attr("id", "pauser")
	    .attr("x", 10)
	    .attr("y", 40)
        .attr("font-size", "12pt")
        .attr("stroke", "black")
        .text("||")
        .style("pointer-events", "none")
        .style("text-anchor", "middle");
    let layout = {
	    autosize: false,
        dragmode: "pan",
	    showlegend: false,
	    legend: { "orientation": "h" },
	    height: popHt,
	    width: width+margin.left,
	    margin: { l: 60, r: 0, b: 25, t: 5, pad: 0 },
//	    paper_bgcolor: "#c7c7c7",
	    plot_bgcolor: "lightgray",
	    textfont: {family:"Helvetica", size: 8 },
	    xaxis: {
            type: "date",
            domain: [0,1],
	    },
        scrollZoom: true
    };
    Plotly.newPlot ('plot', [], layout, {scrollZoom: true,
        displaylogo: false, modeBarButtonsToRemove: ['sendDataToCloud',
        'select2d','lasso2d','zoomIn2d','zoomOut2d']});
    //this is in case decide to do anything special on relayouts
    //plotDiv.on("plotly_relayout", function(evt) { let r = evt["yaxis.range"];; });
    addStripStream(f);
    vertResize();  
}

let svR = [];       //stripchart vertical range for each subplot
svR[0] = [2];       //needs to be defined
let spF = [];       //subplot flows
let subs = +0;      //stripchart subplots

function setUpFlow(f) {
    flows[f].strip = popped.length;     //get trace id
    popped.push(f);
    let c = 1;                          //color id number
    if(flows[f].side < 0)
        c = 0;
    flows[f].sp = subs;
    spF[subs][c] = f;
    if(stripLast < curStrt + dispInt)
        stripLast = curStrt + dispInt;  
    //pass all the points in history to the chart trace
    let r = [], tm = [];
    rtts[f].forEach(obj => {
        if (obj.t <= stripLast) {
            r.push(obj.r);
            tm.push(t2d(obj.t));
        }
    });
    return {
	    x: tm,
	    y: r,
	    name: f,
	    mode: "lines+markers",
	    type: "scattergl",
	    textfont: { family:"Helvetica", size: 8 },
	    textposition: "bottom center",
	    line: { color: lineColor[c], width: 1}
    };
}

function addStripStream(f) {
    //set up the traces for the stream at lane named by f
    if(flows[f].side === 1) {       //do LHS first if exists
        let rf = revFlow(f);
        if(flows[rf])
            f = rf;
    }
    let sp = ++subs;
    spF[sp] = [2];
    let data = [];
    data[0] = setUpFlow(f);
    data[0]["xaxis"] = "x";
    let xr = [t2d(stripLast-statInterval),t2d(stripLast)];
    let annot = [];

    let ya = "yaxis";
    let yd = "y";
    if(sp > 1) { //naming of first subplot is different
        yd = "y" + sp;
    }
    data[0][ya] = yd;
    let layout = {};
    for(let j=1; j < subs; ) { //layout of previous stream subplots
        if(j===1) {
            layout[ya + ".domain"] = [0,(1.0/subs - stripSp)];
        } else {
            layout[ya + ".domain"] = [(j-1)/subs,(j/subs - stripSp)];
        }
        j++;
        ya = "yaxis" + j;
    }
    //set vertical range and check for reverse flow
    svR[sp] = [2];
    svR[sp][0] = 0.98*qdist[f].percentile(0.0);
    svR[sp][1] = qdist[f].percentile(0.98);
    let n = revFlow(f);
    if(flows[n]) {     //if there's a reverse flow, use in vertical range
        data[1] = setUpFlow(n);
        data[1]["yaxis"] = yd;
        if(qdist[n].percentile(0.) < svR[sp][0])
            svR[sp][0] = 0.98*qdist[n].percentile(0.);
        if(qdist[n].percentile(0.98) > svR[sp][1])
            svR[sp][1] = qdist[n].percentile(0.98);
    }
    //set up layout of this subplot
    layout[ya] = {  rangemode: "nonnegative",
                    title: "RTT (ms)",
                    titlefont: {family:"Helvetica", size: 12 },
                    domain: [((subs-1)/subs),1-stripSp],
                    range: svR[sp]
                  };
    if(sp > 1) {
        annot = plotDiv.layout.annotations.map(a => Object.assign({}, a));
        //move the annotation for all the prior subplots
        for(let i=0; i<plotDiv.data.length; i++) {
            let k = plotDiv.data[i]["yaxis"].split("");
            let ypos = 1/subs;
            if(k.length === 2)      //assuming # of subplots <=9
                ypos = (+k[1])/subs;
            annot[i]["y"] = ypos;
        }
    }
    for(let i=0; i<data.length; i++) {
        annot[plotDiv.data.length+i] = { 
            xref: "paper",
            yref: "paper",
            x: i*0.25,
            xanchor: "left",
            y: 1,
            yanchor: "top",
            text: data[i]["name"],
            font: { family: "Helvetica",
                    size: 12,
                    color: data[i]["line"]["color"]
                   },
            showarrow: false
        };
    }
    layout["annotations"] = annot;
    if(sp > 1) {
        let xlines = [];
        for(let i=1; i<sp; i++) {
            xlines[i-1] = { 
                type: "line",
                xref: "paper",
                yref: "paper",
                x0: 0,
                x1: 1,
                y0: i/sp,
                y1: i/sp,
                line: { 
                    color: "black",
                    width: 1
                   }
            };
        }
        layout["shapes"] = xlines;
    }
    Plotly.relayout('plot', layout);    //adds the new subplot to layout
	Plotly.addTraces ('plot', data);    //add data for new stream

    //add a substrip closer for subplot subs and move others
    let ph = document.getElementById("closer").getBoundingClientRect().height;
    let b = (ph - 40)/subs; //spacing between closers
    let csvg = d3.select("#closer svg");
    csvg
	    .append("rect")
        .attr("id", "spcbox" + subs)
	    .attr("x", 0)
	    .attr("y", b)
	    .attr("height", 10)
        .attr("width", 10)
        .style("fill", "gray")
        .style("pointer-events", "all")
	    .on("click", function() {
            let s = +((this.id).split("x")[1]);
            removeStripStream(s);
        });
    csvg
	    .append("text")
        .attr("class", "subplotCloser")
        .attr("id", "spctxt" + subs)
	    .attr("x", 5)
	    .attr("y", b+9)
        .attr("font-size", "8pt")
        .attr("stroke", "black")
        .text("X")
        .style("pointer-events", "none")
        .style("text-anchor", "middle");
        //move closers vertically to match bottom of subplot
        for(let s=2; s<subs; s++) {
            let h = (subs - (s-1))*b;
            d3.select("#spcbox" + s).attr("y", h);
            d3.select("#spctxt" + s).attr("y", h+9);
        }
}

//update all the traces/flows in the pop up strip chart
//time in rtts structures is raw seconds as read from pping -m
//time on plots is in hh:mm:ss format
function updateStrip(endTm) {
    if(popped.length === 0) {         //empty plot
        return;
    }
    let newpts = +0;
    for(let i=1; i<=subs; ++i)  //hack to reset max of range
        svR[i][1] = svR[i][0] + 1;
    // record traces that need to be extended
    let newx = [], newy = [], newid = [];
    for (const f of popped) {
        const rtt = rtts[f];
	    if(!rtt || rtt.length===0 || rtt[rtt.length-1].t <= stripLast) {
		    continue;	//no new points, no update
        }
        let r = [], tm = [];
        for (const obj of rtt) {
            if (obj.t > stripLast && obj.t <= endTm) {
                r.push(obj.r);
                tm.push(t2d(obj.t));
            }
        }
        if (r.length === 0) {
            continue;
        }
        newpts += r.length;
        newx.push(tm); newy.push(r); newid.push(flows[f].strip);
        //set vertical range to go from smallest min to largest 98th of subplot's traces
        let sp = flows[f].sp;
        if (qdist[f].percentile(0.0) < svR[sp][0])
            svR[sp][0] = qdist[f].percentile(0.);
        if(qdist[f].percentile(0.98) > svR[sp][1])
            svR[sp][1] = qdist[f].percentile(0.98);
    }
    if(newpts === 0) {
        return;     //the plot stops moving if no new points
    }
    Plotly.extendTraces ('plot', {x: newx, y: newy }, newid, 10000);
    newx = [], newy = [], newid = [];
    stripLast = endTm; 
    let layout = {};
    let xr = [t2d(stripLast-statInterval),t2d(stripLast)];
    layout["xaxis.range"] = xr;
    let ya = "yaxis";
    for(let i=+1; i<=subs; ) {   //set up range changes for each subplot
        layout[ya + ".range"] = svR[i++];
        ya = "yaxis" + i;
    }
	Plotly.relayout ('plot', layout);
}

function togglePause() {
    if(pauseStrip == true) {
        pauseStrip = false;
        d3.select("#pauser").text("||");
    } else {
        pauseStrip = true;
        d3.select("#pauser").text(">");
    }
}

function removeStripChart() {
    if(!plotDiv.children.length)
	    return;
    //this removes all the traces in one command
    let ids = [];
    for(let i=+0; i<popped.length; i++)
	    ids.push(flows[popped[i]].strip);
    Plotly.deleteTraces ('plot', ids);
    //mysteriously, this seems to do away with the t.emit errors
        //while Plotly.purge() does not
    Plotly.newPlot('plot', [], {});
    d3.select("#plot").html(null);      //Plotly.purge is buggy so do this
    d3.select("#closer svg").remove();
    //removes all the trace info from flows and popped list
    while( popped.length ) {
    	let f = popped.shift();
    	flows[f].strip = -1;
    }
    popHt = 0;
    subs = 0;
}

//removes a single flow
function removeStripFlow(f) {
    let id = flows[f].strip;
    flows[f].strip = -1;
    Plotly.deleteTraces ('plot', id);
    //remove this flow from the list
    popped.splice(popped.indexOf(f), 1);
    //Plotly apparently changes indices so also change ids to match
    let i;
    for(i=0; i<popped.length; i++)
	    flows[popped[i]].strip = i;
    for(i=id; i<plotDiv.layout.annotations.length-1; i++)
        plotDiv.layout.annotations[i] = plotDiv.layout.annotations[i+1];
    plotDiv.layout.annotations[i] = {};
    //plotly resizes itself after deleting last trace so need to fix
    if(!popped.length)
	    Plotly.relayout('plot', {height: popHt});
}

//remove the stream's subplot
function removeStripStream(sp) {
    if(subs === 0)
        return;
    if(subs === 1)  {
        removeStripChart();
        return;
    }
    for(let i=0; i<2; i++) {
        let f = spF[sp][i];
        if(flows[f]) {
            removeStripFlow(f);
        }
    }
    let layout = {};
    //subplot sp is empty, recompute for subs-1 subplots
    for(let s=1; s<subs; s++) {
        //move subplots above sp down by 1
        if(s >= sp) {
            svR[s] = svR[s+1];
            spF[s] = spF[s+1];
        }
        if(s===1) {
            layout["yaxis.range"] = svR[1];
            layout["yaxis.domain"] = [0,(1/(subs-1) - stripSp)];
        } else {
            layout["yaxis" + s + ".range"] = svR[s];
            layout["yaxis" + s + ".domain"] = [(s-1)/(subs-1),(s/(subs-1) - stripSp)];
        }
    }
    //remove subplot subs 
    layout["yaxis" + subs] = {};
    delete spF[subs];
    //remove empty objects from annotate and move yposition of labels
    let annot = [];
    plotDiv.layout.annotations.forEach(obj => { //possibly more trouble than worth
            if(Object.keys(obj).length != 0)
                annot.push(Object.assign({}, obj));
        });
    //move all the subplot annotations and each trace's display axis
    for(let i=0; i<plotDiv.data.length; i++) {      //stuff to do for each trace/flow
        let s = 1;
        let k = plotDiv.data[i]["yaxis"].split("");
        if(k.length === 2) {      //assuming # of subplots <=9
            s = +k[1];
            plotDiv.data[i].yaxis = "y" + s;
        } else
            plotDiv.data[i].yaxis = "y";
        if(s > sp) {
            if(--s > 1)
                plotDiv.data[i].yaxis = "y" + s;
            else
                plotDiv.data[i].yaxis = "y";
            flows[plotDiv.data[i]["name"]].sp--;
        }
        annot[i]["y"] = s/(subs-1);  //subs >= 2 so can't divide by 0
    }
    layout["annotations"] = annot;
    //remove and move xlines
    let xlines = [];
    if(subs > 2) {
        let s = subs-1;     //what new subs will be
        for(let i=1; i<s; i++) {
            xlines[i-1] = { 
                type: "line",
                xref: "paper",
                yref: "paper",
                x0: 0,
                x1: 1,
                y0: i/s,
                y1: i/s,
                line: { 
                    color: "black",
                    width: 1
                   }
            };
        }
    }
    layout["shapes"] = xlines;
    Plotly.relayout("plot", layout);
    //Plotly does not remove this, so need to help
    d3.selectAll(".g-y"+subs+"title").remove();

    //remove closer for subplot subs
    d3.select("#spctxt" + subs).remove();
    d3.select("#spcbox" + subs).remove();
    subs--;
    let ph = document.getElementById("closer").getBoundingClientRect().height;
    let b = (ph - 40)/subs; //spacing between closers
    //move closers vertically to match bottom of subplot
    for(let s=2; s<=subs; s++) {
        let h = (subs - (s-1))*b;
        d3.select("#spcbox" + s).attr("y", h);
        d3.select("#spctxt" + s).attr("y", h+9);
    }
}

const flows = {};       //keeps flow information
const rtts = [];        //keeps the rtt samples for each flow
const qdist = [];
const sts = [];
const side = [];        //track which side of CP src host is on

//Returns CP side of the flow source, passed as src:port 
//Only call this if the side of the flow record isn't set
//	so that it's a flow that hasn't been counted before
//	Keeping a count of number of flows that have been set
function srcSide(sp, dp) {
    //get host src and dst from src:port, dst:port
    let s = (sp.split(":"))[0];
    let d = (dp.split(":"))[0];
    if (!side[s] && !side[d]) {
        side[s] = 1;
        side[d] = -1;
        return +1;
    } else if (side[s] && !side[d]) {
        if (side[s] > 0) {
            side[s]++;
            side[d] = -1;
            return +1;
        } else {
            side[s] -= 1;
            side[d] = 1;
            return -1;
        }
    } else if (!side[s] && side[d]) {
        if (side[d] > 0) {
            side[d]++;
            side[s] = -1;
            return -1;
        } else {
            side[d] -= 1;
            side[s] = 1;
            return +1;
        }
    } else if (side[s] && side[d]) {
        if (side[s] > 0 && side[d] < 0) {
            side[s]++;
            side[d]--;
            return +1;
        } else if (side[s] < 0 && side[d] > 0) {
            side[s]--;
            side[d]++;
            return -1;
        } else { //src and dst have been set to same side
            if (Math.abs(side[s]) >= Math.abs(side[d])) {
                if (side[s] > 0) {
                    side[s]++;
                    side[d] = -1;
                    return +1;
                } else {
                    side[s]--;
                    side[d] = +1;
                    return -1;
                }
            } else {
                if (side[d] > 0) {
                    side[d]++;
                    side[s] = -1;
                    return -1;
                } else {
                    side[d]--;
                    side[s] = +1;
                    return +1;
                }
            }
        }
    }
    console.log("srcSide error: couldn't find a side for flow " + s);
    return 0; //shouldn't get here
}

function revFlow(fname) {
    let i;
    if ((i = fname.indexOf("+")) <= 0)
        return null;
    else return (fname.slice(i + 1) + "+" + fname.slice(0, i));
}

const fdr = [];
let dfdr = {};
const dlabels = [];
let dvals = {};
let yMax = vDisp;
const cntVal = [];

//process pping samples in new statInterval (from curStrt to endtm)
//	gets called once after new statistics interval worth of data has been read
//	older rtt vals are saved for popup strip charts
//	streams are sorted into cntVal, largest to smallest number of pts in stats interval
//  Then the streams that have no points in the latest interval are added on to the end
function mungeData(endtm) {
    const cntd = [];
    //clear the structures for display data
    cntVal.splice(0);
    let inActives = [];
    dispCnt = +0;
    //make sure flows are assigned sides, set up cntVal to sort flow pairs
    for (let k in flows) {    
        //only flows active this stats interval in sts
        if(!sts[k]) {
            flows[k].pts = +0;
            flows[k].q = [0,0,0,0,0];
            if(laneNo[k]) {
                let n = revFlow(k);
                if(!(sts[n]))
                    inActives.push({n: k, t: flows[k].lstTm});
                else if(flows[n].lstTm > flows[k].lstTm)
                    inActives.push({n: k, t: flows[n].lstTm});
            }
            continue;
        }
        if (cntd[k] && cntd[k] === 1) //already got this flow
            continue;
        if (flows[k].side === 0)
            flows[k].side = srcSide(flows[k].src, flows[k].dst);
        let c = sts[k].size();	//number of points in this interval
	    dispCnt += c;
	    flows[k].pts = c;
        cntd[k] = 1;
        //have to save this information in case of redraws
        flows[k].q = [
            sts[k].percentile(0.05),
            sts[k].percentile(0.25),
            sts[k].percentile(0.5),
            sts[k].percentile(0.75),
            sts[k].percentile(0.95)
            ];
        //convention to name the pair with the first (or only) flow of pair
        let n = revFlow(k);
        if (!flows[n] || !sts[n]) {
            cntVal.push({
                c: +c,
                n: k
            });
            continue;
        }
        c += sts[n].size();	//add number of interval points of rev flow
	    dispCnt += sts[n].size();
	    flows[n].pts = sts[n].size();
        flows[n].q = [
            sts[n].percentile(0.05),
            sts[n].percentile(0.25),
            sts[n].percentile(0.5),
            sts[n].percentile(0.75),
            sts[n].percentile(0.95)
            ];
        cntd[n] = 1;
        	cntVal.push({
            	c: +c,
            	n: k
        	});
        if (flows[n].side === 0)
            flows[n].side = srcSide(flows[n].src, flows[n].dst);
        //test to make sure not the same side (shouldn't happen)
        if (flows[n].side === flows[k].side)
            console.log("mungeData error: flow endpoints marked for same side");
    }
    //sort pairs, most points to least into cntVal
    if (cntVal.length)
        cntVal.sort((a, b) => b.c - a.c);
    //sort inactives by most recently used
    if (inActives.length)
        inActives.sort((a, b) => b.t - a.t);
    for(let i=0; i < inActives.length; i++)
        cntVal.push({c: +0, n: inActives[i].n});
    for(let k in sts)
        delete sts[k];     //saved the short term quantiles, clear for next stats interval
}

//remove the stream recorded under this flow from lane display
function unDisplayStream(f) {
    if (!laneNo[f]) 		//test so can call for any deleted flow
	    return;
    //release lane index
    if(laneNo[f] <= vDisp)
        iVal.push(laneNo[f]);
    laneNm[laneNo[f]] = null;
    delete laneNo[f]; //clear
    f = revFlow(f);
    if (!flows[f]) {	//remove from dlabels if necessary
	    let dst = f.split("+")[1];
	    let pos = dlabels.findIndex(obj => obj.dst == dst);
	    if(pos >= 0)
		    dlabels.splice(pos, 1);
    }
}

//uses dispList and unDispList to assign lanes. If not selecting streams
//uses the current sorting in cntVal to get the top vDisp streams and create
//dispList and unDispList
//inActives are streams with assigned lanes and no points this stats interval
//assigns dispList streams to lanes in the laneNo and laneNm arrays
function assignLanes() {
    if(!selectStreams) {
        //default sorted display list
        dispList.splice(0);
        unDispList.splice(0);
        //Compute current yMax, streams to display, limited by vDisp
        let l = cntVal.length;
        if (l) {
            yMax = vDisp > l ? l : vDisp;
        } else
            yMax = 0;
        for (let c = +0; c < l; c++)
            dispList.push(cntVal[c].n);
        for (let c = yMax; c < l; c++)
            if (laneNo[cntVal[c].n])
                unDispList.push(cntVal[c].n);
    }
    while(dispList.length > vDisp) {
        //have to trim the list (for resized while using assigned list)
        //this just takes off the last ones, but could pop up the select list
        unDispList.push(dispList[dispList.length-1])
        dispList.pop();
        yMax = dispList.length;
    }

    //first release lane index values for smaller flow pairs
    //possible it could be listed under the reverse flow, so check that
    for (let j=0; j<unDispList.length; j++) {
        let n = unDispList[j];      //flow name for pair c
        if (laneNo[n]) {
	        unDisplayStream(n);
        } else if(laneNo[revFlow(n)]) {
	        unDisplayStream(revFlow(n)); //filed under reverse flow
        }
    }

    //create the display information array for each flow
    // needs lane index, side, name, quantiles, min rtt
    let k;
    laneNm = [];	//reset
    //go through flow pairs being displayed
    for (let j=0; j<dispList.length; j++) {
        k = dispList[j];        //flow name for pair i
        let n = revFlow(k);
	    let ln;
	    //assign a lane index if none
        if (!laneNo[k] && !laneNo[n])
        {
            if (iVal.length)
                laneNo[k] = iVal.shift();
            else
                console.log("nothing to shift in iVal");
        }
        if (laneNo[k]) {
            ln = laneNo[k] - 1;
	        laneNm[ln] = k;
        } else {
            ln = laneNo[n] - 1;
	        laneNm[ln] = n;
	    }
    }
}

//recomputes the lane information stored in fdr
//assumes that laneNm[] can be used to get the yMax (<=vDisp) streams
function computeLaneBoxes()
{
    //clear the display structures
    dlabels.splice(0);
    fdr.splice(0);
    //push values onto display record in lane order
    //  (if use dispList then not in lane order)
    for(let l=0; l<vDisp; l++) {
	    let k = laneNm[l];
	    if(!k || !flows[k])
		    continue;
        let n = revFlow(k);
	    for(let j=0; j<2; j++) {	//hack to do both sides
        	let e = flows[k];
        	let q = flows[k].q.slice();
		    let pts = flows[k].pts;
        	fdr.push({
            	nm: k,
            	l: l,
            	c: pts,
            	s: e.side,
            	src: e.src,
            	q: q
        	});
		    if(j == 1)
			    break;	//both sides done
        	if (!flows[n]) {
			    //no reverse direction information
            	dlabels.push({
                	l: l,
                	s: (e.side === 1 ? -1 : +1),
                	dst: e.dst
            	});
            	break;	//leave loop, no reverse rtt vals
        	}
		    k = n;	//set for the other side's flow
	    }
    }
    if(dwAutoscale)
        autoScale();
}

function autoScaleOff() {
    dwAutoscale = +0;
    d3.select("#dwAuto").style("visibility", "visible");
    d3.select("#dwStatus").text(" ");
    updateCanvas(0);
}

function autoScaleOn() {
    d3.select("#dwAuto").style("visibility", "hidden");
    d3.select("#dwStatus").text("autoscaled display width (zoom sets manual)");
    dwAutoscale = +1;
    autoScale();	//autoscale with current data
    updateCanvas(0);
}

function toggleGuide() {
    if (guide) {
	    document.getElementById("guideText").style.display = "none";
    	d3.select("#helper").text("show guide");
    	guide = +0;
    } else {
    	document.getElementById("guideText").style.display = "block";
    	d3.select("#helper").text("hide guide");
    	guide = +1;
    }
    //if there's an active stripchart popup, redraw to fit
    if(popped.length) {
    	popHt = window.innerHeight
		    - (document.getElementById("resizer").getBoundingClientRect().bottom
		    + document.getElementById("guide").clientHeight + 15
		    + d3.select("footer").node().getBoundingClientRect().height);
    	popHt = popHt > popHtMin ? popHt : popHtMin;
	    let update = {
		    height: popHt,
		    width: width+margin.left
	    };
	    Plotly.relayout('plot', update);
   	    d3.select("#closer svg")
		    .attr("height", popHt)
       	    .attr("width", margin.right/2);
    }
}

// autoscaling: outer boxes (q[3]) go to 75th but whiskers go to 95th (q[4]). 
function autoScale() {
    if(!dwAutoscale)
        return;	//called by mistake
    let cntSide = [+0,+0]; //cnt of points on each side
    maxV = [+0,+0];
    for(let i=0; i<fdr.length; i++) {
	    let f = fdr[i];
       	let s = (f.s === 1 ? +1 : 0);
	    cntSide[s] += f.c;
        maxV[s] += f.c * f.q[4];
    }
    for(let i=0; i<2; i++) {
	    if (cntSide[i]) {
            maxV[i] /= cntSide[i];
		    maxV[i] *= 1.1;
            maxV[i] = +d3.format(".0f")(maxV[i]);
    	} else 
        	maxV[i] = +d3.format(".0f")(+0);
    }
    if(cntSide[0] === 0 && cntSide[1] === 0)
	    maxV[1] = +50;  //default for no points on either side
}

//This uses current values of fdr and dlabels to draw/redraw canvas
//	One display lane per TCP stream.
function updateCanvas(dur) {
    let transTm = (dur > 0 ? 250 : 0);	//transition time to use
    //horizontal axis scale over both sides max dist
    if(dwAutoscale)
    	xScale.domain([-maxV[0], maxV[1]]);
    let lane = laneHtMin;
    let thck = (lane / 5 > 6 ? lane / 5 : 6); //box thickness in pixels
    thck = +d3.format(".0f")(thck);

    svg.transition().duration(transTm).select(".axis").call(xAxis);
    svg.transition().duration(transTm).select(".cplabel")
        .attr("x", xScale(0));
    svg.transition().duration(transTm).select(".cpline")
        .attr("x1", xScale(0))
        .attr("y1", yScale(0))
        .attr("x2", xScale(0))
        .attr("y2", () => height + yScale(0));
    intervalLabel.text(() => {
        let str = "Captured ";
        str += d3.format("d")(dispCnt) + " ppings over ";
        str += +d3.format(".3r")(dispInt) + " secs";
        return str;
    });

    let y_off = lane/3;
    let c_off = 2*y_off;
    //handle objects for each vertical lane of the output

    //short term stats, for just this stats interval, in yellow boxes
    let ffdr = fdr.filter(obj => obj.c > 0);
    let sfdr = d3.values(ffdr);
    // Create the horizontal rectangles for inner boxes, 25th to 75th
    const qbox = boxg.selectAll(".qbox").data(sfdr);
    qbox.transition().duration(transTm)
        .attr("width", d => d.s * (xScale(d.s * d.q[3]) - xScale(d.s * d.q[1])))
        .attr("height", thck)
        .attr("x", d => d.s > 0? xScale(d.q[1]) : xScale(-d.q[3]))
        .attr("y", d => yScale(d.l) + y_off - thck/2);
    qbox.enter().append("rect")
        .attr("class", "qbox")
        .attr("stroke", "black")
        .attr("stroke-width", 1)
        .attr("fill", "yellow")
        .attr("width", d => d.s * (xScale(d.s * d.q[3]) - xScale(d.s * d.q[1])))
        .attr("height", thck)
        .attr("x", d => d.s > 0? xScale(d.q[1]) : xScale(-d.q[3]))
        .attr("y", d => yScale(d.l) + y_off - thck/2);
    qbox.exit().remove();

    // Create a mini rectangle for the median line
    const median = boxg.selectAll(".median").data(sfdr);
    median.transition().duration(transTm)
        .attr("height", d=> d.c > 0 ? thck : +0)
        .attr("x", d => xScale(d.s * d.q[2]))
        .attr("y", d => yScale(d.l) + y_off - thck/2);
    median.enter().append("rect")
        .attr("class", "median")
        .attr("fill", "blue")
        .style("opacity", 1)
        .attr("width", 2)
        .attr("height", thck)
        .attr("x", d => xScale(d.s * d.q[2]))
        .attr("y", d => yScale(d.l) + y_off - thck/2);
    median.exit().remove();

    //label the boxes with median rtt
    const medtag = boxg.selectAll(".medtag").data(sfdr);
    medtag.transition().duration(transTm)
        .text(d=> d.c > 0 ? d3.format(".3r")(d.q[2]) : "")
        .attr("x", d => xScale(d.s * d.q[2]))
        .attr("y", d => yScale(d.l) + y_off + thck);
    medtag.enter().append("text")
        .attr("class", "medtag")
        .attr("font-family", "sans-serif")
        .attr("font-size", "7pt")
        .attr("stroke", "blue")
        .attr("text-anchor", "middle")
        .text(d=> d3.format(".3r")(d.q[2]))
        .attr("x", d => xScale(d.s * d.q[2]))
        .attr("y", d => yScale(d.l) + y_off + thck);
    medtag.exit().remove();

    //long term stats
    dfdr = d3.values(fdr);
    //show the location of each min RTT with a circle - this is min over all samples
    const minRTT = boxg.selectAll(".minrtt").data(dfdr);
    minRTT.transition().duration(transTm)
        .attr("cx", d => xScale(d.s * qdist[d.nm].percentile(0.0)))
        .attr("cy", d => yScale(d.l) + c_off);
    minRTT.enter().append("circle")
        .attr("class", "minrtt")
        .attr("stroke", "black")
        .attr("r", 4)
        .attr("cx", d => xScale(d.s * qdist[d.nm].percentile(0.0)))
        .attr("cy", d => yScale(d.l) + c_off);
    minRTT.exit().remove();

    // Create the line running from 5th to 95th percentiles, cumulative stats
    const whisk = boxg.selectAll(".whisk").data(dfdr);
    whisk.transition().duration(transTm)
        .attr("x1", d => xScale(d.s * qdist[d.nm].percentile(0.05)))
        .attr("y1", d => (yScale(d.l) + c_off))
        .attr("x2", d => xScale(d.s * qdist[d.nm].percentile(0.95)))
        .attr("y2", d => (yScale(d.l) + c_off));
    whisk.enter().append("line")
        .attr("class", "whisk")
        .attr("stroke", "black")
        .attr("stroke-width", 2)
        .attr("x1", d => xScale(d.s * qdist[d.nm].percentile(0.05)))
        .attr("y1", d => (yScale(d.l) + c_off))
        .attr("x2", d => xScale(d.s * qdist[d.nm].percentile(0.95)))
        .attr("y2", d => (yScale(d.l) + c_off));
    whisk.exit().remove();

    // Create the horizontal rectangles for cumulative boxes, 25th to 75th
    const cqbox = boxg.selectAll(".cqbox").data(dfdr);
    cqbox.transition().duration(transTm)
        .attr("width", d => d.s * (xScale(d.s * qdist[d.nm].percentile(0.75))
            - xScale(d.s * qdist[d.nm].percentile(0.25))))
        .attr("height", thck)
        .attr("x", d => d.s > 0?
            xScale(qdist[d.nm].percentile(0.25)) : xScale(-qdist[d.nm].percentile(0.75)))
        .attr("y", d => yScale(d.l) + c_off - thck/2);
    cqbox.enter().append("rect")
        .attr("class", "cqbox")
        .attr("stroke", "black")
        .attr("stroke-width", 1)
        .attr("fill", "lightgray")
        .attr("width", d => d.s * (xScale(d.s * qdist[d.nm].percentile(0.75))
            - xScale(d.s * qdist[d.nm].percentile(0.25))))
        .attr("height", thck)
        .attr("x", d => d.s > 0?
            xScale(qdist[d.nm].percentile(0.25)) : xScale(-qdist[d.nm].percentile(0.75)))
        .attr("y", d => yScale(d.l) + c_off - thck/2);
    cqbox.exit().remove();

    // Create a mini rectangle for the median line
    const cmedian = boxg.selectAll(".cmedian").data(dfdr);
    cmedian.transition().duration(transTm)
        .attr("x", d => xScale(d.s * qdist[d.nm].percentile(0.5)))
        .attr("y", d => yScale(d.l) + c_off - thck/2);
    cmedian.enter().append("rect")
        .attr("class", "cmedian")
        .attr("fill", "red")
        .style("opacity", 1)
        .attr("width", 2)
        .attr("height", thck)
        .attr("x", d => xScale(d.s * qdist[d.nm].percentile(0.5)))
        .attr("y", d => yScale(d.l) + c_off - thck/2);
    cmedian.exit().remove();

    //label the boxes with median rtt
    const cmedtag = boxg.selectAll(".cmedtag").data(dfdr);
    cmedtag.transition().duration(transTm)
        .text(d=> d3.format(".3r")(qdist[d.nm].percentile(0.5)))
        .attr("x", d => xScale(d.s * qdist[d.nm].percentile(0.5)))
        .attr("y", d => yScale(d.l) + c_off + thck);
    cmedtag.enter().append("text")
        .attr("class", "cmedtag")
        .attr("font-family", "sans-serif")
        .attr("font-size", "7pt")
        .attr("stroke", "red")
        .attr("text-anchor", "middle")
        .text(d=> d3.format(".3r")(qdist[d.nm].percentile(0.5)))
        .attr("x", d => xScale(d.s * qdist[d.nm].percentile(0.5)))
        .attr("y", d => yScale(d.l) + c_off + thck);
    cmedtag.exit().remove();

    //add a label - use the source that was pping'd
    const stag = svg.selectAll(".stag").data(dfdr);
    stag.transition().duration(transTm)
        .text(d => d.src)
        .attr("text-anchor", d => d.s === 1 ? "start" : "end")
        .attr("x", d=> {
            if (d.c > 0)
                return xScale(d.s * d.q[1]);
            else
                return xScale( (d.s>0? maxV[1]/2 : -maxV[0]/2) );
        })
        .attr("y", d => yScale(d.l) + lane / 6);
    stag.enter().append("text")
        .attr("class", "stag")
        .attr("font-size", "9pt")
        .text(d => d.src)
        .attr("text-anchor", d => d.s === 1 ? "start" : "end")
        .attr("x", d => xScale(d.s * d.q[1]))
        .attr("y", d => yScale(d.l) + lane / 6);
    stag.exit().remove();

    //text display for number of samples this flow, this interval
    const nSamp = svg.selectAll(".nSamp").data(dfdr);
    nSamp.transition().duration(transTm)
        .text(d => d.c)
        .attr("text-anchor", "middle")
        .attr("x", d => d.s > 0 ? width + 10 : -30)
        .attr("y", d => yScale(d.l) + 0.6 * lane);
    nSamp.enter().append("text")
        .attr("class", "nSamp")
        .attr("font-size", "8pt")
        .attr("stroke", "gray")
        .text(d => d.c)
        .attr("text-anchor", "middle")
        .attr("x", d => d.s > 0 ? width + 10 : -30)
        .attr("y", d => yScale(d.l) + 0.6 * lane);
    nSamp.exit().remove();

    //these are destinations that have no flow
    dvals = d3.values(dlabels);
    const dtag = svg.selectAll(".dtag").data(dvals);
    dtag.transition().duration(transTm)
        .attr("text-anchor", d => d.s > +0 ? "start" : "end")
        .attr("x", d => xScale(+0))
        .attr("y", d => yScale(d.l) + lane / 6)
        .text(d => d.dst);
    dtag.enter().append("text")
        .attr("class", "dtag")
        .attr("font-size", "8pt")
        .attr("font-style", "italic")
        .attr("text-anchor", d => d.s > +0 ? "start" : "end")
        .attr("x", d => xScale(+0))
        .attr("y", d => yScale(d.l) + lane / 6)
        .text(d => d.dst)
    dtag.exit().remove();
}

function redraw() {
    if(vDisp < vDispMax)	//will get resized to fit
	    vDisp = vDispMax;
    //this just gets the right proportion, value will get recomputed in resizeMap
    popHt *= (window.innerHeight/windowHt)
    popHt = laneHtMin * Math.trunc(popHt/laneHtMin);
    popHt = (popHt > popHtMin ? popHt : popHtMin);
    resizeMap();
    updateCanvas(0);
}

window.addEventListener("resize", redraw);

function sleep(time) { //time in milliseconds
    return new Promise(resolve => setTimeout(resolve, time));
}

function ppLine(line) {
    //line parser
    let rec = line.split(/ /);
    //this input will work for the original pping or bytes-in-pipe version
    if (rec.length !== 4 && rec.length !== 7)
    	return;
    lstTm = +rec[0];
    if (curStrt < 0.) {               //init for this dataset
        curStrt = lstTm - 0.000001;
        cleanUpInt = curStrt;
    }
    const v = {};
    v.t = +rec[0];                  //time of pping in sec
    v.r = 1000. * rec[1];   //rtt in msec
    const key = rec[rec.length-1].slice(0,-1); //remove the newline character
    if (!flows[key]) {
        let i;
        if ((i = key.indexOf("+")) <= 0)
            return 0;
        const s = key.slice(0, i);
        const d = key.slice(i + 1);
        flows[key] = {
            lstTm: v.t,
            src: s,
            dst: d,
            side: 0,
	        pts: +0,
	        strip: -1,              //for trace index
	        sp: +0,                 //for subplot id
        	q: [0, 0, 0, 0, 0]
        };
        rtts[key] = [];
        //use Digest() for an exact to est version
        qdist[key] = new Digest();
        sts[key] = new Digest();
    } else {
        flows[key].lstTm = v.t;
    }
    rtts[key].push(v);
    qdist[key].push(v.r);       //rtt in ms
    if(!sts[key])
        sts[key] = new Digest();
    sts[key].push(v.r);       //short term stats
    //This is here because timer gets wedged when I change virtual displays
    if(timerStartTm > 0 && lstTm - curStrt > 600) {
        cleanUp(lstTm - ptHistory);
        timerStartTm = -1.;         //reset
        setDisplayTimer();
    }
    return;
}

function processInterval(endTm) {
    if(lstTm > 0)   {
        //only set a date if there have been ppLines seen
        //set to time for this data
        dateLabel.text(() => { return new Date(lstTm*1000); });
    }
    //update strip chart if there is one
    if(plotDiv.children.length && !pauseStrip)
	    updateStrip(endTm);
    if(endTm - (curStrt + dispInt) < statInterval)
        return;         //haven't reached stat interval update time
    curStrt += dispInt; //move to the start of this new statistics interval
    dispInt = endTm - curStrt;
    newDispInt = 0.;    //start accumulating time again
    cleanUpInt += dispInt;          //keeps from doing cleanup too often
    if(cleanUpInt > ptHistory/10) {
        cleanUp(endTm);
        cleanUpInt = +0;
    }
    let n=+0;
    d3.select("#runStatus").text("Processing next statistics interval");
    mungeData(endTm); //process the new data and display
    assignLanes();
    computeLaneBoxes();
    d3.select("#runStatus").text("Displaying current interval");
    updateCanvas(1);
}

function cleanUp(now) {
    //remove old values before display
    for (let k in flows) {
        if (now - flows[k].lstTm > maxIdle) {
            if(flows[k].strip >= 0) {
                if(flows[revFlow(k)])           //if still a reverse flow
                    removeStripFlow(k);         //flow record is vanishing
                else
                    removeStripStream(flows[k].sp);       //subplot gets removed
            }
	        unDisplayStream(k);
            delete flows[k];
            delete rtts[k];
            delete qdist[k];
            delete sts[k];
        } else {
            //only keep points from most recent intervals
	        //might be best to clean up more of non-displayed flows?
            while (rtts[k].length && rtts[k][0].t < (now - ptHistory))
                rtts[k].shift();
        }
    }
}

//assignLanes works from a dispList and an unDispList of flow names
//  This lets the user alter those lists. Final lists are made on list exit
//  assignLanes is called when the popup list is deleted
let listPopup;
let dispIndex = [];
let unDispIndex = [];
function popStreamList() {
    if (!listPopup || listPopup.empty()) {
        let h = (cntVal.length + 2)*20;
        h = h > 0.8*height ? 0.8 * height : h;
        listPopup = d3.select("#map").append("div")
            .style("position", "absolute")
            .style("overflow", "auto")
            .style("top", "50px")
            .style("background", "lightgray")
            .style("left", "50px")
            .style("width", "500px")
            .style("height", h + "px")
            .attr("class", "sListDiv");
        listPopup.append("text")
            .attr("x", 5)
            .attr("y", 15)
            .attr("text-anchor", "start")
            .attr("stroke", "black")
            .attr("font-size", "10pt")
            .html(function(d,i) {
                return "Sorted List of " + cntVal.length
                    + "  Streams (#samples in history): select up to "
                    + vDisp + "<br/>";
            });
        selectStreams = true;
        //create the checkbox list
        let curChk = fdr.map( d => d.nm);
        listPopup.selectAll("input").data(cntVal)
            .enter()
            .append("label")
            .html(d => {
                let str1 = "&nbsp";
                let l = 44 - d.n.length;
                for(; l>0; l--)
                    str1 = str1.concat(" &nbsp");
                l = 6 - d.c.toString().length;
                let str2 = "&nbsp";
                for(; l>0; l--)
                    str2 = str2.concat(" &nbsp");
                return "<br/>&nbsp &nbsp" + d.n + str1 + " ("+ str2+ d.c + ")";
                })
            .append("input")
            .property("checked", function(d,i) {
                if(curChk.includes(d.n)) {
                    dispIndex.push(+i)
                    return true;
                }
            })
            .attr("type", "checkbox")
            .attr("value", d => d.n)
            .attr("id", function(d,i) { return i;})
            .on("change", checkboxToggle);

        function checkboxToggle() {
            let cb = d3.select(this);
            if(cb.property("checked")) {
                if(dispIndex.length < vDisp) {
                    //add to dispIndex for display
                    dispIndex.push(+this.id);
                    //remove from unDispIndex if necessary
                    let p = unDispIndex.findIndex(d => d === +this.id);
                    if(p>=0)
                        unDispIndex.splice(p,1);
                } else
                    cb.property("checked", false);      //uncheck
            } else {
               //remove from display list and add to undisplay list
                let p = dispIndex.findIndex(d => d === +this.id);
                if(p>=0)
                    dispIndex.splice(p,1);
                unDispIndex.push(+this.id);
            }
        }
    	d3.select("#streamToggle").text("apply stream list");
    } else {
        listPopup.selectAll("*").remove();
        listPopup.remove();
        listPopup = null;
    	d3.select("#streamToggle").text("show stream list");
        //move the flow names into dispList and unDispList
        dispList.splice(0);     unDispList.splice(0);
        while(dispIndex.length)
            dispList.push(cntVal[ dispIndex.shift() ].n);
        while(unDispIndex.length)
            unDispList.push(cntVal[ unDispIndex.shift() ].n);
        yMax = dispList.length;
        assignLanes();
        computeLaneBoxes();
        updateCanvas(0);
    }
}

function defaultList() {
    selectStreams = false;
    assignLanes();
    computeLaneBoxes();
    updateCanvas(0);
}

let timerStartTm, displayTimer;;
let timer_ret_val = false;
function setDisplayTimer() {
    if(displayTimer)
	    displayTimer.stop();
    displayTimer = d3.interval(displayTime, updateInterval*1000);
}

function displayTime(elapsed) {
    if(lstTm < 0)
	    return timer_ret_val;       //no pp lines read
    if(timerStartTm < 0.) {
	    timerStartTm = Date.now();  //initialize
	    curStrt = lstTm;	//set from last ppline seen
	    return timer_ret_val;
    }
	let nowVal = Date.now();
    let lstTimerInterval = (nowVal - timerStartTm)/1000.;
	newDispInt += lstTimerInterval;
	timerStartTm = nowVal;
	if(Object.keys(rtts).length === 0 || Object.keys(flows).length === 0) {
        d3.select("#runStatus").text("No points to process");
	} else {
	    //curStrt+dispInt is where last display ended
        //doesn't redo box plots till statInterval secs pass
	    processInterval (curStrt + dispInt + newDispInt);
	}
    return timer_ret_val;
}

const fileCnt = +0;
let offset;
let blockSize;
let curFile;
let onLoadHandler;

function readBlock(_offset, length, _file) {
    const r = new FileReader();
    const blob = _file.slice(_offset, length + _offset);
    r.onload = onLoadHandler;
    r.readAsText(blob);
}

//These need to be preserved across chunks of each file
let frag = null;
let endOfFile = +0;
let chunk = []; //going to hold the array of line strings

//parse a file chunk
function chunkParser(index) {
    for (; index < chunk.length; index++) {
        let line = chunk[index];
        if (frag) { //is there a leftover line fragment?
            line = frag + line;
            frag = null;
        }
        //no newline means it's a line fragment at end of chunk
        if (line[line.length - 1] != "\n") {
            frag = line;
        } else if (line[line.length - 1] === "\n") {
	        ppLine(line);
	        //check if time to process and display a new interval
            //file reader updates on box plot updates
            if (lstTm - (curStrt + dispInt) > statInterval ||
                                        index + 1 === chunk.length) {
		        processInterval(lstTm);
                sleepTm = dispInt * 1000.; //ms
                return ++index; //want to start on next line
            }
        }
    } //end of parsing file chunk
    return -1; //finished the chunk
}

function initParams() {
    if(plotDiv.children.length)
        removeStripChart();
    dispInt = 0.;
    newDispInt = 0.;
    curStrt = -1.;
    lstTm = -1.;
    laneNm = [];
    for (let h in laneNo)	//clear out all the assigned lanes
	delete laneNo[h];
    iVal.splice(0);
    for (let i = 1; i <= vDisp; i++)
	    iVal.push(i);
    for (let k in flows)
        delete flows[k];
    for (let k in qdist)
        delete qdist[k];
    for (let k in sts)
        delete sts[k];
    for (let k in rtts)
        delete rtts[k];
    for (let s in side)
        delete side[s];
    cntVal.splice(0);
    fdr.splice(0);
    dlabels.splice(0);
    dispList.splice(0);
    unDispList.splice(0);
    selectStreams = false;      //initialize with a sort list
    yMax = +vDisp;
    autoScaleOn();	        //calls updateCanvas
    timerStartTm = -1;
}

//This gets called when the "choose file" button is changed
function processInputFile(files) { //files should be a FileList
    if (files && files.length) {
        //going to read in the file in largish blocks
        const fileSize = files[0].size;
	    //reset for new files
        curFile = files[0];
        freeRun = +0;
        offset = +0;
        endOfFile = +0;
        blockSize = 64 * 1024; // bytes
        frag = null;
	    initParams();
        //change the status message on web page
        d3.select("#runStatus").text("Processing File");
        freeRun = +1; //function is a toggle so this starts in 
        setRunMode(); // step mode
        //define the function that gets called for each new block
        // called by event of finishing a block read from the file
        // splits the block into lines in the chunk array
        onLoadHandler = evt => {
            if (evt.target.error == null) {
                offset += evt.target.result.length;
                //chunk parser - evt.target.result is the file chunk
                // calls display when ready
                const text = evt.target.result;
                chunk = text.split(/^/m);
            } else {
                console.log("Read error: " + evt.target.error);
                return;
            }
            if (offset >= fileSize) // check for eof
                endOfFile = 1;
            //go to data input and update manager
            ppvizManager();
            return;
        } //end of OnLoadHandler definition

        // start the read with the first block;	onLoadHandler makes subsequent calls
        readBlock(offset, blockSize, files[0]);
    } // else d3.select("#runStatus").text("No file selected");
} //closes the processInputFile function

//toggles
function setRunMode() {
    if (freeRun) {
        freeRun = +0;
        d3.select("#runMode").text("animate");
        d3.select("#nextButton").style("visibility", "visible");
        d3.select("#runStatus").text("Changing to single step mode");
    } else {
        freeRun = +1;
        d3.select("#runStatus").text("Changing to animate mode");
        d3.select("#runMode").text("step mode");
        d3.select("#nextButton").style("visibility", "hidden");
        ppvizManager();
    }
}

function changeLanes(cl) {
    vDisp = cl;
    //resets number of lanes available and tests vDisp
    resizeMap();
}

function changeInterval(ni) {
    updateInterval = +ni;
    if(updateInterval > ptHistory) {
	    ptHistory = updateInterval;
	    d3.select("#sampStore").text(ptHistory);
    }
    if(displayTimer)
	    setDisplayTimer();
}

function changeBoxHist(bh) {
    statInterval = +bh;
    d3.select("#boxHist").text(statInterval);
}

function changePtHist(ph) {
    ptHistory = +ph;
    if(updateInterval > ptHistory) {
	    updateInterval = ptHistory;
	    d3.select("#updateInt").text(updateInterval);
    }
}

let nLines = 0; //tracks which line in the file read
async function ppvizManager() {
    if (freeRun)
        d3.select("#runStatus").text("In free running animation mode");
    do {
        if (!curFile)
            return;
        if (!chunk.length)
            return;
        d3.select("#runStatus").text("Processing next display interval");
        nLines = chunkParser(nLines); //returns if displayed or eof
        if (nLines < 0) { //end of block
            nLines = 0;
            if (endOfFile) {
                curFile = 0;
                d3.select("#runStatus").text("Choose a new file");
                return;
            }
            d3.select("#runStatus").text("Reading more data from file");
            readBlock(offset, blockSize, curFile);
            return;
        } else if (freeRun && sleepTm > 0.) {
            await sleep(sleepTm / 10); //divided by 10 to speed things up
        }
    } while (freeRun);

    //otherwise just exits and waits
    d3.select("#runStatus").text("Push next button to advance");
}

//Sets up canvas.
//	Command line html sets a timer for updateInterval
//	File reader html waits for a file to be chosen from web page
function initPage() {
    initCanvas();
    toggleGuide();
    initParams();
}

initPage();

//
// TDigest:
//
// approximate distribution percentiles from a stream of reals
//

function TDigest(delta, K, CX) {
    // allocate a TDigest structure.
    //
    // delta is the compression factor, the max fraction of mass that
    // can be owned by one centroid (bigger, up to 1.0, means more
    // compression). delta=false switches off TDigest behavior and treats
    // the distribution as discrete, with no merging and exact values
    // reported.
    //
    // K is a size threshold that triggers recompression as the TDigest
    // grows during input.  (Set it to 0 to disable automatic recompression)
    //
    // CX specifies how often to update cached cumulative totals used
    // for quantile estimation during ingest (see cumulate()).  Set to
    // 0 to use exact quantiles for each new point.
    //
    this.discrete = (delta === false);
    this.delta = delta || 0.01;
    this.K = (K === undefined) ? 25 : K;
    this.CX = (CX === undefined) ? 1.1 : CX;
    this.centroids = new RBTree(compare_centroid_means);
    this.nreset = 0;
    this.reset();
}

TDigest.prototype.reset = function() {
    // prepare to digest new points.
    //
    this.centroids.clear();
    this.n = 0;
    this.nreset += 1;
    this.last_cumulate = 0;
};

TDigest.prototype.size = function() {
    return this.centroids.size;
};

TDigest.prototype.toArray = function(everything) {
    // return {mean,n} of centroids as an array ordered by mean.
    //
    var result = [];
    if (everything) {
        this._cumulate(true); // be sure cumns are exact
        this.centroids.each(function(c) { result.push(c); });
    } else {
        this.centroids.each(function(c) { result.push({mean:c.mean, n:c.n}); });
    }
    return result;
};

TDigest.prototype.summary = function() {
    var approx = (this.discrete) ? "exact " : "approximating ";
    var s = [approx + this.n + " samples using " + this.size() + " centroids",
             "min = "+this.percentile(0),
             "Q1  = "+this.percentile(0.25),
             "Q2  = "+this.percentile(0.5),
             "Q3  = "+this.percentile(0.75),
             "max = "+this.percentile(1.0)];
    return s.join('\n');
};

function compare_centroid_means(a, b) {
    // order two centroids by mean.
    //
    return (a.mean > b.mean) ? 1 : (a.mean < b.mean) ? -1 : 0;
}

function compare_centroid_mean_cumns(a, b) {
    // order two centroids by mean_cumn.
    //
    return (a.mean_cumn - b.mean_cumn);
}

TDigest.prototype.push = function(x, n) {
    // incorporate value or array of values x, having count n into the
    // TDigest. n defaults to 1.
    //
    n = n || 1;
    x = Array.isArray(x) ? x : [x];
    for (var i = 0 ; i < x.length ; i++) {
        this._digest(x[i], n);
    }
};

TDigest.prototype.push_centroid = function(c) {
    // incorporate centroid or array of centroids c
    //
    c = Array.isArray(c) ? c : [c];
    for (var i = 0 ; i < c.length ; i++) {
        this._digest(c[i].mean, c[i].n);
    }
};

TDigest.prototype._cumulate = function(exact) {
    // update cumulative counts for each centroid
    //
    // exact: falsey means only cumulate after sufficient
    // growth. During ingest, these counts are used as quantile
    // estimates, and they work well even when somewhat out of
    // date. (this is a departure from the publication, you may set CX
    // to 0 to disable).
    //
    if (this.n === this.last_cumulate ||
        !exact && this.CX && this.CX > (this.n / this.last_cumulate)) {
        return;
    }
    var cumn = 0;
    this.centroids.each(function(c) {
        c.mean_cumn = cumn + c.n / 2; // half of n at the mean
        cumn = c.cumn = cumn + c.n;
    });
    this.n = this.last_cumulate = cumn;
};

TDigest.prototype.find_nearest = function(x) {
    // find the centroid closest to x. The assumption of
    // unique means and a unique nearest centroid departs from the
    // paper, see _digest() below
    //
    if (this.size() === 0) {
        return null;
    }
    var iter = this.centroids.lowerBound({mean:x}); // x <= iter || iter==null
    var c = (iter.data() === null) ? iter.prev() : iter.data();
    if (c.mean === x || this.discrete) {
        return c; // c is either x or a neighbor (discrete: no distance func)
    }
    var prev = iter.prev();
    if (prev && Math.abs(prev.mean - x) < Math.abs(c.mean - x)) {
        return prev;
    } else {
        return c;
    }
};

TDigest.prototype._new_centroid = function(x, n, cumn) {
    // create and insert a new centroid into the digest (don't update
    // cumulatives).
    //
    var c = {mean:x, n:n, cumn:cumn};
    this.centroids.insert(c);
    this.n += n;
    return c;
};

TDigest.prototype._addweight = function(nearest, x, n) {
    // add weight at location x to nearest centroid.  adding x to
    // nearest will not shift its relative position in the tree and
    // require reinsertion.
    //
    if (x !== nearest.mean) {
        nearest.mean += n * (x - nearest.mean) / (nearest.n + n);
    }
    nearest.cumn += n;
    nearest.mean_cumn += n / 2;
    nearest.n += n;
    this.n += n;
};

TDigest.prototype._digest = function(x, n) {
    // incorporate value x, having count n into the TDigest.
    //
    var min = this.centroids.min();
    var max = this.centroids.max();
    var nearest = this.find_nearest(x);
    if (nearest && nearest.mean === x) {
        // accumulate exact matches into the centroid without
        // limit. this is a departure from the paper, made so
        // centroids remain unique and code can be simple.
        this._addweight(nearest, x, n);
    } else if (nearest === min) {
        this._new_centroid(x, n, 0); // new point around min boundary
    } else if (nearest === max ) {
        this._new_centroid(x, n, this.n); // new point around max boundary
    } else if (this.discrete) {
        this._new_centroid(x, n, nearest.cumn); // never merge
    } else {
        // conider a merge based on nearest centroid's capacity. if
        // there's not room for all of n, don't bother merging any of
        // it into nearest, as we'll have to make a new centroid
        // anyway for the remainder (departure from the paper).
        var p = nearest.mean_cumn / this.n;
        var max_n = Math.floor(4 * this.n * this.delta * p * (1 - p));
        if (max_n - nearest.n >= n) {
            this._addweight(nearest, x, n);
        } else {
            this._new_centroid(x, n, nearest.cumn);
        }
    }
    this._cumulate(false);
    if (!this.discrete && this.K && this.size() > this.K / this.delta) {
        // re-process the centroids and hope for some compression.
        this.compress();
    }
};

TDigest.prototype.bound_mean = function(x) {
    // find centroids lower and upper such that lower.mean < x <
    // upper.mean or lower.mean === x === upper.mean. Don't call
    // this for x out of bounds.
    //
    var iter = this.centroids.upperBound({mean:x}); // x < iter
    var lower = iter.prev();      // lower <= x
    var upper = (lower.mean === x) ? lower : iter.next();
    return [lower, upper];
};

TDigest.prototype.p_rank = function(x_or_xlist) {
    // return approximate percentile-ranks (0..1) for data value x.
    // or list of x.  calculated according to
    // https://en.wikipedia.org/wiki/Percentile_rank
    //
    // (Note that in continuous mode, boundary sample values will
    // report half their centroid weight inward from 0/1 as the
    // percentile-rank. X values outside the observed range return
    // 0/1)
    //
    // this triggers cumulate() if cumn's are out of date.
    //
    var xs = Array.isArray(x_or_xlist) ? x_or_xlist : [x_or_xlist];
    var ps = xs.map(this._p_rank, this);
    return Array.isArray(x_or_xlist) ? ps : ps[0];
};

TDigest.prototype._p_rank = function(x) {
    if (this.size() === 0) {
        return undefined;
    } else if (x < this.centroids.min().mean) {
        return 0.0;
    } else if (x > this.centroids.max().mean) {
        return 1.0;
    }
    // find centroids that bracket x and interpolate x's cumn from
    // their cumn's.
    this._cumulate(true); // be sure cumns are exact
    var bound = this.bound_mean(x);
    var lower = bound[0], upper = bound[1];
    if (this.discrete) {
        return lower.cumn / this.n;
    } else {
        var cumn = lower.mean_cumn;
        if (lower !== upper) {
            cumn += (x - lower.mean) * (upper.mean_cumn - lower.mean_cumn) / (upper.mean - lower.mean);
        }
        return cumn / this.n;
    }
};

TDigest.prototype.bound_mean_cumn = function(cumn) {
    // find centroids lower and upper such that lower.mean_cumn < x <
    // upper.mean_cumn or lower.mean_cumn === x === upper.mean_cumn. Don't call
    // this for cumn out of bounds.
    //
    // XXX because mean and mean_cumn give rise to the same sort order
    // (up to identical means), use the mean rbtree for our search.
    this.centroids._comparator = compare_centroid_mean_cumns;
    var iter = this.centroids.upperBound({mean_cumn:cumn}); // cumn < iter
    this.centroids._comparator = compare_centroid_means;
    var lower = iter.prev();      // lower <= cumn
    var upper = (lower && lower.mean_cumn === cumn) ? lower : iter.next();
    return [lower, upper];
};

TDigest.prototype.percentile = function(p_or_plist) {
    // for percentage p (0..1), or for each p in a list of ps, return
    // the smallest data value q at which at least p percent of the
    // observations <= q.
    //
    // for discrete distributions, this selects q using the Nearest
    // Rank Method
    // (https://en.wikipedia.org/wiki/Percentile#The_Nearest_Rank_method)
    // (in scipy, same as percentile(...., interpolation='higher')
    //
    // for continuous distributions, interpolates data values between
    // count-weighted bracketing means.
    //
    // this triggers cumulate() if cumn's are out of date.
    //
    var ps = Array.isArray(p_or_plist) ? p_or_plist : [p_or_plist];
    var qs = ps.map(this._percentile, this);
    return Array.isArray(p_or_plist) ? qs : qs[0];
};

TDigest.prototype._percentile = function(p) {
    if (this.size() === 0) {
        return undefined;
    }
    this._cumulate(true); // be sure cumns are exact
    var h = this.n * p;
    var bound = this.bound_mean_cumn(h);
    var lower = bound[0], upper = bound[1];

    if (upper === lower || lower === null || upper === null) {
        return (lower || upper).mean;
    } else if (!this.discrete) {
        return lower.mean + (h - lower.mean_cumn) * (upper.mean - lower.mean) / (upper.mean_cumn - lower.mean_cumn);
    } else if (h <= lower.cumn) {
        return lower.mean;
    } else {
        return upper.mean;
    }
};

function pop_random(choices) {
    // remove and return an item randomly chosen from the array of choices
    // (mutates choices)
    //
    var idx = Math.floor(Math.random() * choices.length);
    return choices.splice(idx, 1)[0];
}

TDigest.prototype.compress = function() {
    // TDigests experience worst case compression (none) when input
    // increases monotonically.  Improve on any bad luck by
    // reconsuming digest centroids as if they were weighted points
    // while shuffling their order (and hope for the best).
    //
    if (this.compressing) {
        return;
    }
    var points = this.toArray();
    this.reset();
    this.compressing = true;
    while (points.length > 0) {
        this.push_centroid(pop_random(points));
    }
    this._cumulate(true);
    this.compressing = false;
};

function Digest(config) {
    // allocate a distribution digest structure. This is an extension
    // of a TDigest structure that starts in exact histogram (discrete)
    // mode, and automatically switches to TDigest mode for large
    // samples that appear to be from a continuous distribution.
    //
    this.config = config || {};
    this.mode = this.config.mode || 'auto'; // disc, cont, auto
    TDigest.call(this, this.mode === 'cont' ? config.delta : false);
    this.digest_ratio = this.config.ratio || 0.9;
    this.digest_thresh = this.config.thresh || 1000;
    this.n_unique = 0;
}
Digest.prototype = Object.create(TDigest.prototype);
Digest.prototype.constructor = Digest;

Digest.prototype.push = function(x_or_xlist) {
    TDigest.prototype.push.call(this, x_or_xlist);
    this.check_continuous();
};

Digest.prototype._new_centroid = function(x, n, cumn) {
    this.n_unique += 1;
    TDigest.prototype._new_centroid.call(this, x, n, cumn);
};

Digest.prototype._addweight = function(nearest, x, n) {
    if (nearest.n === 1) {
        this.n_unique -= 1;
    }
    TDigest.prototype._addweight.call(this, nearest, x, n);
};

Digest.prototype.check_continuous = function() {
    // while in 'auto' mode, if there are many unique elements, assume
    // they are from a continuous distribution and switch to 'cont'
    // mode (tdigest behavior). Return true on transition from
    // disctete to continuous.
    if (this.mode !== 'auto' || this.size() < this.digest_thresh) {
        return false;
    }
    if (this.n_unique / this.size() > this.digest_ratio) {
        this.mode = 'cont';
        this.discrete = false;
        this.delta = this.config.delta || 0.01;
        this.compress();
        return true;
    }
    return false;
};

//RBTree = (function(window) {
//var global = window;

function TreeBase() {}

// removes all nodes from the tree
TreeBase.prototype.clear = function() {
    this._root = null;
    this.size = 0;
};

// returns node data if found, null otherwise
TreeBase.prototype.find = function(data) {
    var res = this._root;

    while(res !== null) {
        var c = this._comparator(data, res.data);
        if(c === 0) {
            return res.data;
        }
        else {
            res = res.get_child(c > 0);
        }
    }

    return null;
};

// returns iterator to node if found, null otherwise
TreeBase.prototype.findIter = function(data) {
    var res = this._root;
    var iter = this.iterator();

    while(res !== null) {
        var c = this._comparator(data, res.data);
        if(c === 0) {
            iter._cursor = res;
            return iter;
        }
        else {
            iter._ancestors.push(res);
            res = res.get_child(c > 0);
        }
    }

    return null;
};

// Returns an iterator to the tree node at or immediately after the item
TreeBase.prototype.lowerBound = function(item) {
    var cur = this._root;
    var iter = this.iterator();
    var cmp = this._comparator;

    while(cur !== null) {
        var c = cmp(item, cur.data);
        if(c === 0) {
            iter._cursor = cur;
            return iter;
        }
        iter._ancestors.push(cur);
        cur = cur.get_child(c > 0);
    }

    for(var i=iter._ancestors.length - 1; i >= 0; --i) {
        cur = iter._ancestors[i];
        if(cmp(item, cur.data) < 0) {
            iter._cursor = cur;
            iter._ancestors.length = i;
            return iter;
        }
    }

    iter._ancestors.length = 0;
    return iter;
};

// Returns an iterator to the tree node immediately after the item
TreeBase.prototype.upperBound = function(item) {
    var iter = this.lowerBound(item);
    var cmp = this._comparator;

    while(iter.data() !== null && cmp(iter.data(), item) === 0) {
        iter.next();
    }

    return iter;
};

// returns null if tree is empty
TreeBase.prototype.min = function() {
    var res = this._root;
    if(res === null) {
        return null;
    }

    while(res.left !== null) {
        res = res.left;
    }

    return res.data;
};

// returns null if tree is empty
TreeBase.prototype.max = function() {
    var res = this._root;
    if(res === null) {
        return null;
    }

    while(res.right !== null) {
        res = res.right;
    }

    return res.data;
};

// returns a null iterator
// call next() or prev() to point to an element
TreeBase.prototype.iterator = function() {
    return new Iterator(this);
};

// calls cb on each node's data, in order
TreeBase.prototype.each = function(cb) {
    var it=this.iterator(), data;
    while((data = it.next()) !== null) {
        cb(data);
    }
};

// calls cb on each node's data, in reverse order
TreeBase.prototype.reach = function(cb) {
    var it=this.iterator(), data;
    while((data = it.prev()) !== null) {
        cb(data);
    }
};


function Iterator(tree) {
    this._tree = tree;
    this._ancestors = [];
    this._cursor = null;
}

Iterator.prototype.data = function() {
    return this._cursor !== null ? this._cursor.data : null;
};

// if null-iterator, returns first node
// otherwise, returns next node
Iterator.prototype.next = function() {
    if(this._cursor === null) {
        var root = this._tree._root;
        if(root !== null) {
            this._minNode(root);
        }
    }
    else {
        if(this._cursor.right === null) {
            // no greater node in subtree, go up to parent
            // if coming from a right child, continue up the stack
            var save;
            do {
                save = this._cursor;
                if(this._ancestors.length) {
                    this._cursor = this._ancestors.pop();
                }
                else {
                    this._cursor = null;
                    break;
                }
            } while(this._cursor.right === save);
        }
        else {
            // get the next node from the subtree
            this._ancestors.push(this._cursor);
            this._minNode(this._cursor.right);
        }
    }
    return this._cursor !== null ? this._cursor.data : null;
};

// if null-iterator, returns last node
// otherwise, returns previous node
Iterator.prototype.prev = function() {
    if(this._cursor === null) {
        var root = this._tree._root;
        if(root !== null) {
            this._maxNode(root);
        }
    }
    else {
        if(this._cursor.left === null) {
            var save;
            do {
                save = this._cursor;
                if(this._ancestors.length) {
                    this._cursor = this._ancestors.pop();
                }
                else {
                    this._cursor = null;
                    break;
                }
            } while(this._cursor.left === save);
        }
        else {
            this._ancestors.push(this._cursor);
            this._maxNode(this._cursor.left);
        }
    }
    return this._cursor !== null ? this._cursor.data : null;
};

Iterator.prototype._minNode = function(start) {
    while(start.left !== null) {
        this._ancestors.push(start);
        start = start.left;
    }
    this._cursor = start;
};

Iterator.prototype._maxNode = function(start) {
    while(start.right !== null) {
        this._ancestors.push(start);
        start = start.right;
    }
    this._cursor = start;
};

function Node(data) {
    this.data = data;
    this.left = null;
    this.right = null;
    this.red = true;
}

Node.prototype.get_child = function(dir) {
    return dir ? this.right : this.left;
};

Node.prototype.set_child = function(dir, val) {
    if(dir) {
        this.right = val;
    }
    else {
        this.left = val;
    }
};

function RBTree(comparator) {
    this._root = null;
    this._comparator = comparator;
    this.size = 0;
}

RBTree.prototype = new TreeBase();

// returns true if inserted, false if duplicate
RBTree.prototype.insert = function(data) {
    var ret = false;

    if(this._root === null) {
        // empty tree
        this._root = new Node(data);
        ret = true;
        this.size++;
    }
    else {
        var head = new Node(undefined); // fake tree root

        var dir = 0;
        var last = 0;

        // setup
        var gp = null; // grandparent
        var ggp = head; // grand-grand-parent
        var p = null; // parent
        var node = this._root;
        ggp.right = this._root;

        // search down
        while(true) {
            if(node === null) {
                // insert new node at the bottom
                node = new Node(data);
                p.set_child(dir, node);
                ret = true;
                this.size++;
            }
            else if(is_red(node.left) && is_red(node.right)) {
                // color flip
                node.red = true;
                node.left.red = false;
                node.right.red = false;
            }

            // fix red violation
            if(is_red(node) && is_red(p)) {
                var dir2 = ggp.right === gp;

                if(node === p.get_child(last)) {
                    ggp.set_child(dir2, single_rotate(gp, !last));
                }
                else {
                    ggp.set_child(dir2, double_rotate(gp, !last));
                }
            }

            var cmp = this._comparator(node.data, data);

            // stop if found
            if(cmp === 0) {
                break;
            }

            last = dir;
            dir = cmp < 0;

            // update helpers
            if(gp !== null) {
                ggp = gp;
            }
            gp = p;
            p = node;
            node = node.get_child(dir);
        }

        // update root
        this._root = head.right;
    }

    // make root black
    this._root.red = false;

    return ret;
};

// returns true if removed, false if not found
RBTree.prototype.remove = function(data) {
    if(this._root === null) {
        return false;
    }

    var head = new Node(undefined); // fake tree root
    var node = head;
    node.right = this._root;
    var p = null; // parent
    var gp = null; // grand parent
    var found = null; // found item
    var dir = 1;

    while(node.get_child(dir) !== null) {
        var last = dir;

        // update helpers
        gp = p;
        p = node;
        node = node.get_child(dir);

        var cmp = this._comparator(data, node.data);

        dir = cmp > 0;

        // save found node
        if(cmp === 0) {
            found = node;
        }

        // push the red node down
        if(!is_red(node) && !is_red(node.get_child(dir))) {
            if(is_red(node.get_child(!dir))) {
                var sr = single_rotate(node, dir);
                p.set_child(last, sr);
                p = sr;
            }
            else if(!is_red(node.get_child(!dir))) {
                var sibling = p.get_child(!last);
                if(sibling !== null) {
                    if(!is_red(sibling.get_child(!last)) && !is_red(sibling.get_child(last))) {
                        // color flip
                        p.red = false;
                        sibling.red = true;
                        node.red = true;
                    }
                    else {
                        var dir2 = gp.right === p;

                        if(is_red(sibling.get_child(last))) {
                            gp.set_child(dir2, double_rotate(p, last));
                        }
                        else if(is_red(sibling.get_child(!last))) {
                            gp.set_child(dir2, single_rotate(p, last));
                        }

                        // ensure correct coloring
                        var gpc = gp.get_child(dir2);
                        gpc.red = true;
                        node.red = true;
                        gpc.left.red = false;
                        gpc.right.red = false;
                    }
                }
            }
        }
    }

    // replace and remove if found
    if(found !== null) {
        found.data = node.data;
        p.set_child(p.right === node, node.get_child(node.left === null));
        this.size--;
    }

    // update root and make it black
    this._root = head.right;
    if(this._root !== null) {
        this._root.red = false;
    }

    return found !== null;
};

function is_red(node) {
    return node !== null && node.red;
}

function single_rotate(root, dir) {
    var save = root.get_child(!dir);

    root.set_child(!dir, save.get_child(dir));
    save.set_child(dir, root);

    root.red = true;
    save.red = false;

    return save;
}

function double_rotate(root, dir) {
    root.set_child(!dir, single_rotate(root.get_child(!dir), !dir));
    return single_rotate(root, dir);
}

function TreeBase() {}

// removes all nodes from the tree
TreeBase.prototype.clear = function() {
    this._root = null;
    this.size = 0;
};

// returns node data if found, null otherwise
TreeBase.prototype.find = function(data) {
    var res = this._root;

    while(res !== null) {
        var c = this._comparator(data, res.data);
        if(c === 0) {
            return res.data;
        }
        else {
            res = res.get_child(c > 0);
        }
    }

    return null;
};

// returns iterator to node if found, null otherwise
TreeBase.prototype.findIter = function(data) {
    var res = this._root;
    var iter = this.iterator();

    while(res !== null) {
        var c = this._comparator(data, res.data);
        if(c === 0) {
            iter._cursor = res;
            return iter;
        }
        else {
            iter._ancestors.push(res);
            res = res.get_child(c > 0);
        }
    }

    return null;
};

// Returns an iterator to the tree node at or immediately after the item
TreeBase.prototype.lowerBound = function(item) {
    var cur = this._root;
    var iter = this.iterator();
    var cmp = this._comparator;

    while(cur !== null) {
        var c = cmp(item, cur.data);
        if(c === 0) {
            iter._cursor = cur;
            return iter;
        }
        iter._ancestors.push(cur);
        cur = cur.get_child(c > 0);
    }

    for(var i=iter._ancestors.length - 1; i >= 0; --i) {
        cur = iter._ancestors[i];
        if(cmp(item, cur.data) < 0) {
            iter._cursor = cur;
            iter._ancestors.length = i;
            return iter;
        }
    }

    iter._ancestors.length = 0;
    return iter;
};

// Returns an iterator to the tree node immediately after the item
TreeBase.prototype.upperBound = function(item) {
    var iter = this.lowerBound(item);
    var cmp = this._comparator;

    while(iter.data() !== null && cmp(iter.data(), item) === 0) {
        iter.next();
    }

    return iter;
};

// returns null if tree is empty
TreeBase.prototype.min = function() {
    var res = this._root;
    if(res === null) {
        return null;
    }

    while(res.left !== null) {
        res = res.left;
    }

    return res.data;
};

// returns null if tree is empty
TreeBase.prototype.max = function() {
    var res = this._root;
    if(res === null) {
        return null;
    }

    while(res.right !== null) {
        res = res.right;
    }

    return res.data;
};

// returns a null iterator
// call next() or prev() to point to an element
TreeBase.prototype.iterator = function() {
    return new Iterator(this);
};

// calls cb on each node's data, in order
TreeBase.prototype.each = function(cb) {
    var it=this.iterator(), data;
    while((data = it.next()) !== null) {
        cb(data);
    }
};

// calls cb on each node's data, in reverse order
TreeBase.prototype.reach = function(cb) {
    var it=this.iterator(), data;
    while((data = it.prev()) !== null) {
        cb(data);
    }
};


function Iterator(tree) {
    this._tree = tree;
    this._ancestors = [];
    this._cursor = null;
}

Iterator.prototype.data = function() {
    return this._cursor !== null ? this._cursor.data : null;
};

// if null-iterator, returns first node
// otherwise, returns next node
Iterator.prototype.next = function() {
    if(this._cursor === null) {
        var root = this._tree._root;
        if(root !== null) {
            this._minNode(root);
        }
    }
    else {
        if(this._cursor.right === null) {
            // no greater node in subtree, go up to parent
            // if coming from a right child, continue up the stack
            var save;
            do {
                save = this._cursor;
                if(this._ancestors.length) {
                    this._cursor = this._ancestors.pop();
                }
                else {
                    this._cursor = null;
                    break;
                }
            } while(this._cursor.right === save);
        }
        else {
            // get the next node from the subtree
            this._ancestors.push(this._cursor);
            this._minNode(this._cursor.right);
        }
    }
    return this._cursor !== null ? this._cursor.data : null;
};

// if null-iterator, returns last node
// otherwise, returns previous node
Iterator.prototype.prev = function() {
    if(this._cursor === null) {
        var root = this._tree._root;
        if(root !== null) {
            this._maxNode(root);
        }
    }
    else {
        if(this._cursor.left === null) {
            var save;
            do {
                save = this._cursor;
                if(this._ancestors.length) {
                    this._cursor = this._ancestors.pop();
                }
                else {
                    this._cursor = null;
                    break;
                }
            } while(this._cursor.left === save);
        }
        else {
            this._ancestors.push(this._cursor);
            this._maxNode(this._cursor.left);
        }
    }
    return this._cursor !== null ? this._cursor.data : null;
};

Iterator.prototype._minNode = function(start) {
    while(start.left !== null) {
        this._ancestors.push(start);
        start = start.left;
    }
    this._cursor = start;
};

Iterator.prototype._maxNode = function(start) {
    while(start.right !== null) {
        this._ancestors.push(start);
        start = start.right;
    }
    this._cursor = start;
};

function Node(data) {
    this.data = data;
    this.left = null;
    this.right = null;
}

Node.prototype.get_child = function(dir) {
    return dir ? this.right : this.left;
};

Node.prototype.set_child = function(dir, val) {
    if(dir) {
        this.right = val;
    }
    else {
        this.left = val;
    }
};

function BinTree(comparator) {
    this._root = null;
    this._comparator = comparator;
    this.size = 0;
}

BinTree.prototype = new TreeBase();

// returns true if inserted, false if duplicate
BinTree.prototype.insert = function(data) {
    if(this._root === null) {
        // empty tree
        this._root = new Node(data);
        this.size++;
        return true;
    }

    var dir = 0;

    // setup
    var p = null; // parent
    var node = this._root;

    // search down
    while(true) {
        if(node === null) {
            // insert new node at the bottom
            node = new Node(data);
            p.set_child(dir, node);
            ret = true;
            this.size++;
            return true;
        }

        // stop if found
        if(this._comparator(node.data, data) === 0) {
            return false;
        }

        dir = this._comparator(node.data, data) < 0;

        // update helpers
        p = node;
        node = node.get_child(dir);
    }
};

// returns true if removed, false if not found
BinTree.prototype.remove = function(data) {
    if(this._root === null) {
        return false;
    }

    var head = new Node(undefined); // fake tree root
    var node = head;
    node.right = this._root;
    var p = null; // parent
    var found = null; // found item
    var dir = 1;

    while(node.get_child(dir) !== null) {
        p = node;
        node = node.get_child(dir);
        var cmp = this._comparator(data, node.data);
        dir = cmp > 0;

        if(cmp === 0) {
            found = node;
        }
    }

    if(found !== null) {
        found.data = node.data;
        p.set_child(p.right === node, node.get_child(node.left === null));

        this._root = head.right;
        this.size--;
        return true;
    }
    else {
        return false;
    }
}

