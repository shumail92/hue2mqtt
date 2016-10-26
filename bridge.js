const config = require('config');
const HueUtil = require('hue-util');
const fs = require('fs');
const _ = require('lodash');
const localConfigFile = './config/local.json';

// Empty hue client.
var hue = null;

// *********  MQTT Stuff ************
const mqtt = require('mqtt');

// Load mqtt Config
var mqttConf = config.get('mqtt');

// Configure the MQTT client to connect with a will statement (this will be send when we get disconnected.)
var mqttOptions = {
    will: {
        topic: mqttConf.topic + 'connected',
        message: 0,
        qos: 0
    }
};
if (mqttConf.user && mqttConf.password) {
    mqttOptions.username = mqttConf.user;
    mqttOptions.password = mqttConf.password;
}
const client = mqtt.connect(mqttConf.host, mqttOptions);

client.on('connect', () => {
    console.log('Connected to MQTT: %s', mqttConf.host);
    // Inform controllers we are connected to mqtt (but not yet to the hardware).
    publishConnectionStatus();
    client.subscribe(mqttConf.topic + 'set/light/+');

});

client.on('message', (topic, message) => {
    if (!hue)
        return;

    if (topic.startsWith(mqttConf.topic + 'set/light/')) {
        var name = topic.substr(topic.lastIndexOf('/') + 1);
        if (hueLights[name]) {
            var setOptions = {
                lightNumber: hueLights[name].id
            };
            if (IsNumeric(message)) { // try to set the brightness
                var value = parseInt(message);
                if (value == 0) {
                    setOptions.on = false;
                } else if (value > 0 && value <= 255) {
                    setOptions.on = true;
                    setOptions.bri = value;
                } else {
                    console.warn('%d not a valid input for brightness. %s', value, name);
                    return; // No valid input
                }
            } else { // value not a number, try parsing json.
                try {
                    var payload = JSON.parse(message);
                    var lightData = _.pick(payload, ['on', 'bri', 'color', 'alert', 'effect', 'transitiontime']);
                    setOptions = _.merge(setOptions, lightData);
                } catch (err) {
                    console.warn(err);
                    return;
                }
            }

            // If we get to here, we will have a 'setOptions' object with to desired values.
            console.log('Setting light \'%s\' with %s', JSON.stringify(setOptions));
            clearTimeout(hueTimer); // Stop the update timer.
            hue.changeLights(setOptions, function(err, resp) {
                if (err) {
                    console.log(err);
                }
                // Publish update for all lights.
                publishHueStatus();
            });

        } else { // End if light exists. Do something else?
            console.warn('Light \'%s\' does not exists.', name);
        }

    } else if (topic == mqttConf.topic + 'lightsout') {
        clearTimeout(hueTimer);
        hue.changeGroup(0, {
            on: false
        }, function(err, resp) {
            if (err) {
                console.log(err);
            }
            // Publish update for all lights.
            publishHueStatus();
        });
    } else if (topic == mqttConf.topic + 'lightson') {
        clearTimeout(hueTimer);
        hue.changeGroup(0, {
            on: true
        }, function(err, resp) {
            if (err) {
                console.log(err);
            }
            // Publish update for all lights.
            publishHueStatus();
        });
    }
});

function publishConnectionStatus() {
    var status = "1";
    if (hue && config.hue.username)
        status = "2";
    client.publish(mqttConf.topic + 'connected', status, {
        qos: 0,
        retain: true
    });
}
// *********  End MQTT Stuff ********

// ********* Philips hue stuff ******

// loading the config.
var hueConfig = config.get('hue');
var hueLights = [];
var hueTimer = null;

const hueAppName = "hue2mqtt";
hue = new HueUtil(hueAppName, hueConfig.ip, hueConfig.username, onHueUsernameChange);
console.log('Created Hue client with ip: %s and user %s', hueConfig.ip, hueConfig.username);

if (!hueConfig.ip) {
    hue.getBridgeIp(function(err, ip) {
        if (err) {
            console.error(err);
            process.exit(10);
        }

        console.log('Found IP: %s, saving to config.', ip);
        var currentConfig = JSON.parse(fs.readFileSync(localConfigFile));
        if (!currentConfig.hue)
            currentConfig.hue = {};
        currentConfig.hue.ip = ip;
        fs.writeFileSync(
            localConfigFile,
            JSON.stringify(currentConfig, null, '  '));

        // We got an IP at this moment.
        console.log('Trying to create a user for hue2mqtt. Be sure to press the button.');
        hue.createUser(function(err, resp) {
            if (err) {
                console.error(err);
                process.exit(11);
            }
            publishHueStatus();
        });
    });
} else if (!hueConfig.username) { // We have an IP but no user yet.
    console.log('Trying to create a user for hue2mqtt. Be sure to press the button.');
    hue.createUser(function(err, resp) {
        if (err) {
            console.error(err);
            process.exit(11);
        }
        // The data gets saved by the 'onHueUsernameChange' function.
        publishHueStatus();
    });
} else { // We got both an IP and an username.
    publishHueStatus();
}

// This function gets called if the hue client created a username.
function onHueUsernameChange(newUsername) {
    console.log('Got new username: %s', newUsername);
    var currentConfig = JSON.parse(fs.readFileSync(localConfigFile));

    currentConfig.hue.username = newUsername;
    fs.writeFileSync(
        localConfigFile,
        JSON.stringify(currentConfig, null, '  '));
};

// After the first time this function fires it will schedule itself again.
function publishHueStatus() {
    console.log('Start publishHueStatus');
    if (!hue)
        return;

    hue.getLights(function(err, lights) {

        for (var id in lights) {
            var light = lights[id];
            light.id = parseInt(id);
            var name = light.name.toLowerCase().replace(/ /g, '_');

            // publish status on changes
            if (hueLights[name] == null || !_.isEqual(hueLights[name].state, light.state)) {
                console.log('Publishing state for \'%s\'', name)
                var message = {
                    val: 0,
                    hue_state: light.state,
                    ts: Date.now()
                };
                if (light.state.on && light.state.reachable) {
                    // Set val to brightness if on and reachable.
                    message.val = light.state.bri;
                }
                client.publish(
                    mqttConf.topic + 'status/light/' + name,
                    JSON.stringify(message), {
                        qos: 0,
                        retain: true
                    }
                );
            }
            hueLights[name] = light;

        } // end foreach

        hueTimer = setTimeout(publishHueStatus, hueConfig.updateInterval * 1000);

    });
}

function IsNumeric(val) {
    return Number(parseFloat(val)) == val;
}
