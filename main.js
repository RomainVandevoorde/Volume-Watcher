/*
The MIT License (MIT)

Copyright (c) 2014 Chris Wilson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
var audioContext = null;
var meter = null;
var canvasContext = null;
var WIDTH=500;
var HEIGHT=50;
var rafID = null;

window.onload = function() {

	launchButton = document.getElementById('control').getElementsByTagName('button')[0];
	mainDisplay = document.getElementById('display');
	counter = mainDisplay.getElementsByTagName('h2')[0];
	debugDiv = document.getElementById('debug');

	// Nécessaire pour Google Chrome
    launchButton.addEventListener('click', function(){
        audioContext.resume();
        launchButton.style.display = 'none';
        mainDisplay.style.display = 'block';
    });

    // grab our canvas
    // canvasContext = document.getElementById( "meter" ).getContext("2d");

    // monkeypatch Web Audio
    window.AudioContext = window.AudioContext || window.webkitAudioContext;

    // grab an audio context
    audioContext = new AudioContext();

    // Pour avoir le même comportement que Chrome dans tous les navigateurs
    audioContext.suspend();

    // Attempt to get audio input
    try {
        // monkeypatch getUserMedia
        navigator.getUserMedia =
        	navigator.getUserMedia ||
        	navigator.webkitGetUserMedia ||
        	navigator.mozGetUserMedia;

        // ask for an audio input
        navigator.getUserMedia(
        {
            "audio": {
                "mandatory": {
                    "googEchoCancellation": "false",
                    "googAutoGainControl": "false",
                    "googNoiseSuppression": "false",
                    "googHighpassFilter": "false"
                },
                "optional": []
            }
        }, gotStream, didntGetStream);
    } catch (e) {
        alert('getUserMedia threw exception :' + e);
    }

};


function didntGetStream() {
    alert('Stream generation failed.');
}

var mediaStreamSource = null;

function gotStream(stream) {
    // Create an AudioNode from the stream.
    mediaStreamSource = audioContext.createMediaStreamSource(stream);

    // Create a new volume meter and connect it.
    meter = createAudioMeter(audioContext);
    mediaStreamSource.connect(meter);

    // kick off the visual updating
    myLoop();
}

function getGradient(nb) {

	var step1 = 25; // Step 1: yellow
	var step2 = 50; // Step 2: red
	var inter = step2-step1;

	if(nb < 0 ) {
		return 'rgb(0,200,0)';
	}
	else if(nb < step1) {
		// var redLvl = 6*nb;
		var redLvl = Math.ceil((255/step1)*nb);
		return 'rgb('+redLvl+',200,0)';

	} else if (nb < step2) {
		// yellow to red
		// var greenLvl = 200 - 5*(nb-40);
		var greenLvl = Math.ceil(200 - ((200/inter)*(nb - inter)));
		return 'rgb(255,'+greenLvl+',0)';

	} else if (!isFinite(nb)) {
		// Si on ne reçoit pas de donénes du micro, background noir
		return 'rgb(0,0,0)';

	} else {
		// red
		return 'rgb(255,0,0)';
	}
}

function dynamicGradient(nb) {

	// Si on ne reçoit pas de donénes du micro, background noir
	if (!isFinite(nb)) return 'rgb(0,0,0)';

	var gradRange = (maxData - minData);
	var gradMin = minData + (gradRange/10);
	var gradMax = maxData - (gradRange/5);
	var gradAvg = (gradMin+gradMax)/2;

	if(nb <= gradMin) {
		// Volume égal ou plus bas au minimum => vert
		return 'rgb(0,200,0)';
	}	else if(nb < gravAvg) {
		// Volume entre le minimum et la moyenne => vert->orange
		var redLvl = Math.ceil((255/(gradAvg-gradMin))*nb);
		return 'rgb('+redLvl+',200,0)';
	}
	else if(nb < gradMax) {
		// Volume entre la moyenne et le maximum => orange->rouge
		var greenLvl = Math.ceil(200 - ((200/(gradMax-gradAvg))*(nb - (gradMax-gradAvg))));
		return 'rgb(255,'+greenLvl+',0)';
	}
	// Volume plus grand ou égal au maximum => rouge
	else return 'rgb(255,0,0)';

}

/*function drawLoop( time ) {

	var divDisplay = document.getElementById('dispRom');
	var level = Math.log10(meter.volume)*20 + 40;

	divDisplay.innerHTML = time;
	divDisplay.style.backgroundColor = getGradient(level);



    // clear the background
    canvasContext.clearRect(0,0,WIDTH,HEIGHT);

    // check if we're currently clipping
    if (meter.checkClipping())
        canvasContext.fillStyle = "red";
    else
        canvasContext.fillStyle = "green";

    // draw a bar based on the current volume
    canvasContext.fillRect(0, 0, meter.volume*WIDTH*1.4, HEIGHT);

    // set up the next visual callback
    rafID = window.requestAnimationFrame( drawLoop );
}*/

// Permet d'ajouter des données au tableau en enlevant les éléments les plus vieux et en validant la donnée
// data: float
// array: array
// return array
function addData(data, array) {

	// Au chargement de la page, data vaudra -Infinity
	// On ne veut évidemment pas stocker ces données dans le tableau
	if(!isFinite(data)) return array;

	// Si il y a moins de 40 éléments, push simple
	// Si il y a 40 élements, on enlève le premier avant d'ajouter notre nouvelle donnée
	if(array.length < 60) {
		array.push(data);
		return array;
	} else {
		array.shift();
		array.push(data);
		return array;
	}

}

function getDisplayNb(nb) {

    if(isNaN(nb) || nb < 0 || !isFinite(nb)) return 0;

    return Math.round(nb);

}



// Calcule la moyenne de tous les éléments d'un tableau
// return float
function arrAvg(array) {
	var total = 0;
	var nb = array.length;

	for (var i = 0; i < nb; i++) {
		total += array[i];
	}
	return total/nb;
}

then = 0; // Init variable de calcul du temps passsé entre deux frames
volData = []; // Store volume data

minData = 0;
maxData = 0;

function myLoop(time) {

	var delay = 50; // Délai entre deux calculs
	var avTime = 2000;

	requestAnimationFrame(myLoop);

	now = time;
	elapsed = now - then;

	if(elapsed > delay) {

		then = now - (elapsed%delay);

		var level = Math.log10(meter.volume)*20 + 60;

		volData = addData(level, volData);
		var curAvg = arrAvg(volData);
		var curGradient = getGradient(curAvg);

		if(isFinite(level) && time > 5000) {
            if (minData === 0 || level < minData) minData = level;
            if (level > maxData) maxData = level;
        }

		// Update debug info
		debugDiv.innerHTML = 'lvl: '+Math.round(level);
		debugDiv.innerHTML += '<br>dat: '+volData.length;
		debugDiv.innerHTML += '<br>avg: '+curAvg;
		debugDiv.innerHTML += '<br>rgb: '+curGradient;
		debugDiv.innerHTML += '<br>Min: '+minData;
    debugDiv.innerHTML += '<br>Max: '+maxData;

		// Change background color
		document.getElementsByTagName('body')[0].style.backgroundColor = curGradient;
		// Change displayed number
		counter.innerHTML = getDisplayNb(curAvg);


	}

}
