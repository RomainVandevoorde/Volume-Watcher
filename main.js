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

var starttime = null;

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


function dynamicGradient(nb) {

	// Si on ne reçoit pas de donénes du micro, background noir
	if (!isFinite(nb)) return 'rgb(0,0,0)';


	var gradRange = (maxData - minData);
	var gradMin = minData;
	var gradMax = maxData;
	var gradAvg = (gradMin+gradMax)/2;

	if(nb <= gradMin) {
		// Volume égal ou plus bas au minimum => vert
		return 'rgb(0,200,0)';
	}	else if(nb < gradAvg) {
		// Volume entre le minimum et la moyenne => vert->orange
		var redLvl = Math.ceil((255/(gradAvg-gradMin))*(nb-gradMin));
		return 'rgb('+redLvl+',200,0)';
	}
	else if(nb < gradMax) {
		// Volume entre la moyenne et le maximum => orange->rouge
		var greenLvl = Math.ceil(200 - ((200/(gradMax-gradAvg))*((nb-gradMin) - (gradMax-gradAvg))));
		return 'rgb(255,'+greenLvl+',0)';
	}
	// Volume plus grand ou égal au maximum => rouge
	else return 'rgb(255,0,0)';

}

function scaleGradient(nb) {

	var gradRange = scaleMax - scaleMin;
	var gradMin = scaleMin + (gradRange/5);
	var gradMax = scaleMax;
	var gradAvg = (gradMin+gradMax)/2;

	if(nb <= gradMin) {
		return 'rgb(0,200,0)';
	} else if (nb < gradAvg) {
		var redLvl = Math.ceil((255/(gradAvg-gradMin))*(nb-gradMin));
		return 'rgb('+redLvl+',200,0)';
	}
	else if(nb < gradMax) {
		// Volume entre la moyenne et le maximum => orange->rouge
		var greenLvl = Math.ceil(200 - ((200/(gradMax-gradAvg))*((nb-gradMin) - (gradMax-gradAvg))));
		return 'rgb(255,'+greenLvl+',0)';
	}
	else return 'rgb(255,0,0)';

}

scaleMin = 0;
scaleMax = 100;

function getCustomScale(nb) {
	return scaleMin+(((nb-minData)/(maxData-minData))*(scaleMax-scaleMin));
}

// Permet d'ajouter des données au tableau en enlevant les éléments les plus vieux et en validant la donnée
function addData(data, array) {

	// Au chargement de la page, data vaudra -Infinity
	// On ne veut évidemment pas stocker ces données dans le tableau
	if(!isFinite(data)) return array;

	// Si il y a moins de 40 éléments, push simple
	// Si il y a plus 40 élements, on enlève le premier avant d'ajouter notre nouvelle donnée
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

	if(array.length === 0) return null;

	var total = 0;
	var nb = array.length;

	for (var i = 0; i < nb; i++) {
		total += array[i];
	}
	return total/nb;
}

then = 0; // Init variable de calcul du temps passsé entre deux frames
volData = []; // Store volume data

localData = window.localStorage;

minData = (localData.getItem('minData')) ? localData.getItem('minData') : null;
maxData = (localData.getItem('maxData')) ? localData.getItem('maxData') : null;

function myLoop(time) {

	var delay = 50; // Délai entre deux calculs
	var avTime = 2000;

	requestAnimationFrame(myLoop);

	now = time;
	elapsed = now - then;

	if(elapsed > delay) {

		then = now - (elapsed%delay);

		var level = Math.log10(meter.volume)*20 + 80;

		volData = addData(level, volData);
		var curAvg = arrAvg(volData);

		// Pour éviter des bugs
		if(curAvg !== null) {
			if(curAvg < minData || minData === null) {
				minData = curAvg;
				localData.setItem('minData', curAvg);
			}
			if(curAvg > maxData || maxData === null) {
				maxData = curAvg;
				localData.setItem('maxData', curAvg);
			}
		}

		var scaleNb = getCustomScale(curAvg);
		var curGradient = scaleGradient(scaleNb);

		// Update debug info
		debugDiv.innerHTML = 'lvl: '+Math.round(level);
		debugDiv.innerHTML += '<br>dat: '+volData.length;
		debugDiv.innerHTML += '<br>avg: '+curAvg;
		// debugDiv.innerHTML += '<br>rgb: '+curGradient;
		debugDiv.innerHTML += '<br>Min: '+minData;
    debugDiv.innerHTML += '<br>Max: '+maxData;
		debugDiv.innerHTML += '<br>Loc: '+localData.getItem('minData')+'/'+localData.getItem('maxData');

		// Change background color
		document.getElementsByTagName('body')[0].style.backgroundColor = curGradient;
		// Change displayed number
		counter.innerHTML = Math.ceil(scaleNb);


	}

}
