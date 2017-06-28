# Hue2mqtt

[![npm version](https://badge.fury.io/js/hue2mqtt.svg)](https://badge.fury.io/js/hue2mqtt)

This node.js application is a bridge between the [Philips Hue](http://meethue.com) and a mqtt server. Your lights will be polled every x seconds and the status(es) get published to your (local) mqtt server. As with a bridge it also works the other way around. You can turn on/off (and set the state) of your lights with a message to mqtt.

It's intended as a building block in heterogenous smart home environments where an MQTT message broker is used as the centralized message bus. See [MQTT Smarthome on Github](https://github.com/mqtt-smarthome/mqtt-smarthome) for a rationale and architectural overview.

*Updated for Larissa*

# Topics

Every message starts with a prefix (see [config](#config)) that defaults to `hue`. So if you change this all the topics change.

## Connect messages

This bridge uses the `hue/connected` topic to send retained connection messages. Use this topic to check your if your hue bridge is still running.

- `0` or missing is not connected (set by will functionality).
- `1` is connected to mqtt, but not to the hue hardware.
- `2` is connected to mqtt and hue hardware. (ultimate success!)

## Status messages

The status of each light will be published to `hue/status/light/light_name` as a JSON object containing the following fields. The light_name is all lowercase and spaces are replaced with `_`.

- `val` current brightness (or `0` if the light is off or unreachable).
- `hue_state` JSON object retrieved from hue bridge.
- `ts` timestamp of last update.

Each status message is retained, so if you subscribe after a status message, you will always get the last status.

By default the light statusses get pulled every 15 seconds. But you can override that by setting `hue.updateInterval` in your [local config](#config) look at the [default config](config/default.json).

## Setting the lights

You can control each light by send one of the options below to `hue/set/light/light_name`:

- a single brightness value. (Number between 0 and 255, 0 for off)
- a json object containing (some of) the following properties:

  - `on` boolean
  - `bri` brightness (0-255)
  - `color` color input according to [tinycolor2](https://www.npmjs.com/package/tinycolor2)
  - `alert` `select` (breath/blink once), `lselect` (breath 30 sec), `none` (back to normal)
  - `effect` `colorloop` (rainbow mode), `none` (back to normal)
  - `transitiontime` number (multiplied with 100 ms) to transition from the current state to the new state.

## Extra commands

We also implemented some handy commands:
-  `hue/lightsout` switch off all lights.
-  `hue/lightson` switch on all the lights. (Please explain to me why you would use this?)

# Config

You would typically run this app in the background, but first you have to configure it. You should first install [Node.JS](https://nodejs.org/en/download/).

```bash
git clone https://github.com/svrooij/hue2mqtt.git
cd hue2mqtt
npm install
nano config/local.json
```

You are now in the config file. Enter the following data as needed. See [mqtt.connect](https://www.npmjs.com/package/mqtt#connect) for options how to format the host. `mqtt://ip_address:1883` is the easiest.

```json
{
  "mqtt": {
    "host":"mqtt://127.0.0.1:1883",
    "user":null,
    "password":null
  }
}
```

## Press the button!!

The first time you run this application, it tries to connect to your hue system automatically, but that will only work if you press the button on your bridge. So do that before your start this appliation.

Try to start the application by running `npm start` or directly by `node bridge.js`, and the topics should appear on your mqtt server.

# Use [PM2](http://pm2.keymetrics.io) to run in background

If everything works as expected, you should make the app run in the background automatically. Personally I use PM2 for this. And they have a great [guide for this](http://pm2.keymetrics.io/docs/usage/quick-start/).
