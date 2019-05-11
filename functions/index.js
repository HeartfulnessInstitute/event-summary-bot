// Copyright 2017, Google, Inc.
// Licensed under the Apache License, Version 2.0 (the 'License');
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an 'AS IS' BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Dialogflow fulfillment getting started guide:
// https://dialogflow.com/docs/how-tos/getting-started-fulfillment

'use strict';

const admin = require('firebase-admin');
const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {BigQuery} = require("@google-cloud/bigquery");
const Fuse = require("fuse.js");
const Cities = require("hfn-centers");
//const Cities = require("indian-cities-json");

process.env.DEBUG = 'dialogflow:*'; // enables lib debugging statements
admin.initializeApp(functions.config().firebase);
var db = admin.firestore();


exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    const agent = new WebhookClient({ request, response });
    console.log("dialogflowFirebaseFulfillment: Body: " + JSON.stringify(request.body));

    function writeToBq (es) {
        let datasetName = "hfn_event_bot";
        let tableName = "event_summary";
        let bq = new BigQuery();

        let dataset = bq.dataset(datasetName);
        dataset.exists().catch(err => {
            console.error(
                `dataset.exists: dataset ${datasetName} does not exist: ${JSON.stringify(err)}`
            );
            return err;
        });

        let table = dataset.table(tableName);
        table.exists().catch(err => {
            console.error(
                `table.exists: table ${tableName} does not exist: ${JSON.stringify(err)}`
            );
            return err;
        });

        var esBody = {
            "ignoreUnknowValues": true,
            "json": es,
            "skipInvalidRows": true
        };

        return table.insert(esBody, {raw: true}).catch(err => {
            console.error(`table.insert: ${JSON.stringify(err)}`);
            return err;
        });
    }

    function findCity (city) {
		let options = {
			keys: ["city"]
		}
		let fuse = new Fuse(Cities.cities, options);
		let result = fuse.search(city);
		//return result[0]["name"];
		return result[0];
    }

    function askForConfirmation(agent) {
        let type = agent.parameters['event_type'];
        let count = agent.parameters['event_count'];
        let name = agent.parameters['coordinator_name'];
        let phone = agent.parameters['coordinator_phone'];
        let isoDate = agent.parameters['event_date'];
        let institution = agent.parameters['event_institution'];
        let location_info = findCity(agent.parameters['event_city']);
        let city = location_info["city"]
        let zone = location_info["zone"]
        let country = location_info["country"]
        let feedback = agent.parameters['event_feedback'];
        // converting ISO date to `date`
        let date = isoDate.split("T")[0];  
        agent.add(`Okay, ${count} attended ${type} on ${date} at ${institution} in ${city}, as reported by the awesome coordinator ${name} who can be reached at ${phone}.\n Did I get that right?`);
        return;

    }
  
    function writeToDb (agent) {
        // Get parameter from Dialogflow with the string to add to the database
        const context = agent.getContext('eventinfo-followup');
        let type = context.parameters['event_type'];
        let count = context.parameters['event_count'];
        let name = context.parameters['coordinator_name'];
        let phone = context.parameters['coordinator_phone'];
        let isoDate = context.parameters['event_date'];
        let institution = context.parameters['event_institution'];
        let location_info = findCity(context.parameters['event_city']);
        let city = location_info["city"]
        let zone = location_info["zone"]
        let country = location_info["country"]
        let feedback = agent.parameters['event_feedback'];
        let feedback = context.parameters['event_feedback'];
        // converting ISO date to `date`
        let date = isoDate.split("T")[0];
        let eventSummary = {
            "name": name,
          	"phone": phone,
            "type": type,
            "count": count,
            "date": date,
            "institution": institution,
            "city": city,
            "zone": zone,
            "country": country
            "feedback": feedback
        }
        const databaseEntry = eventSummary
        const dialogflowAgentRef = db.collection('event-summary').doc();
        return db.runTransaction(t => {
            t.set(dialogflowAgentRef, {entry: databaseEntry});
            writeToBq(eventSummary);
            return Promise.resolve('Write complete');
        }).then(doc => {
            agent.add(`Thanks for submitting the information and all the best. Please submit the complete feedback with attendee information (if available, for *public* events) at our Events Portal: events.heartfulness.org`);
        }).catch(err => {
            console.log(`Error writing to Firestore: ${err}`);
            agent.add(`Failed to write "${databaseEntry}" to the Firestore database.`);
        });
    }

    // Run the proper function handler based on the matched Dialogflow intent name
    let intents = new Map();
    intents.set('event.info', askForConfirmation);
    intents.set('event.info.yes', writeToDb);
    agent.handleRequest(intents);
});
