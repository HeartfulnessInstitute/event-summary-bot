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
const uuidv4 = require('uuid/v4');


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
        // Configure Fuse options to be strict, as we dont want incorrect matches for center names
        let options = {
            shouldSort: true,
            includeScore: true,
            threshold: 0.2,
            location: 0,
            distance: 100,
            maxPatternLength: 32,
            minMatchCharLength: 1,
            keys: [
              "city",
            ]
        };
		let fuse = new Fuse(Cities.cities, options);
        let result = fuse.search(city);
        if(result.length > 0) {
          	console.log(result);
          	console.log(result[0].item);
            return(result[0].item);
        } else {
            return({"city": city, "zone":"unknown", "country": "unknown"});
        }
    }
  
    function cleanDate(isoDateString) {
      // Sometimes Dialogflow sets the year to 2020. Force year to be current year if in the future.
      let d = new Date();
      let currentYear = d.getFullYear();  	
      let isoDate = new Date(isoDateString);
      if (isoDate.getFullYear() > currentYear) {
       	isoDate.setFullYear(currentYear);
      }
      // If the date is still in the future, set it to today
      if (isoDate > d) {
        isoDate = d;
      }
      // Extract only the date in yyyy-mm-dd format
      let dateOnly = isoDate.toISOString().split("T")[0];
      return(dateOnly);
    }

    function connectContact(event_type){
        let connectContacts = {};
		
      	if (event_type) {
          connectContacts["ROCF"] = "info@rocf.org";
          connectContacts["S-Connect-HELP"] = "sconnect@heartfulness.org";
          connectContacts["u-connect"] = "uconnect@heartfulness.org";
          connectContacts["Family-Connect"] = "fconnect@heartfulness.org";
          connectContacts["g-connect"] = "gconnect@heartfulness.org";
          connectContacts["Divya-Janani"] = "divyajanani@heartfulness.org";
          connectContacts["Research"] = "research@heartfulness.org";
          connectContacts["Heartfulness-green"] = "green@heartfulness.org";
          connectContacts["v-connect"] = "vconnect@heartfulness.org";
          connectContacts["L-Connect"] = "lconnect@heartfulness.org";
          connectContacts["NGO-Connect"] = "ngoconnect@heartfulness.org";
          connectContacts["Yoga"] = "yoga@heartfulness.org";
          connectContacts["glow-pearl"] = "webinars@heartfulness.org";
          connectContacts["Brighter-Minds"] = "brighterminds@heartfulness.org";
          connectContacts["at-work"] = "atwork@heartfulness.org";
          connectContacts["S-Connect-HEART"] = "sconnect@heartfulness.org";
          connectContacts["dhyanotsav"] = "dhyanotsav@heartfulness.org";
          connectContacts["s-connect"] = "sconnect@heartfulness.org";
          connectContacts["S-Connect-THWC"] = "sconnect@heartfulness.org";
          connectContacts["books-and-more"] = "booksandmore@heartfulness.org";
          connectContacts["S-Connect-INSPIRE"] = "sconnect@heartfulness.org";
          connectContacts["Kaushalam"] = "kaushalam@heartfulness.org";
          
		  // Not supported currently
          //connectContacts["Religious Institutions"] = "it@heartfulness.org";
          //connectContacts["Heartfulness Introduction"] = "it@heartfulness.org";
          //connectContacts["Other"] = "it@heartfulness.org";
          //connectContacts["Youth"] = "it@heartfulness.org";
          //connectContacts["group-meditation"] = "it@heartfulness.org";
          //connectContacts["Indian Diaspora"] = "it@heartfulness.org";

          if(event_type in connectContacts) {
              return(connectContacts[event_type]);
          }
        }
        return("");
    }

    function welcomeMessage(agent) {
        agent.add(`Greetings! What Heartfulness event are you reporting on?
        \nFor example, you can enter Dhyanotsav, U-Connect, AtWork, C-Connect, V-Connect, G-Connect, CME, Youth, Yoga, Temple, Legal, Family, NGO, Brighter Minds, etc. 
        \nFor general Heartfulness Introductory Events, just enter "Heartfulness". 
        \nFor School or S-Connect events, enter which program: HELP, INSPIRE, HEART or THWC
        \nFor Group Meditations, simply enter "Satsangh" or "Group Meditation"
        \nIf you don't know just enter 'Other'.`);
        return;

    }

    function askForConfirmation(agent) {
        let type = agent.parameters['event_type'];
        let event_day = agent.parameters['event_day'];
        let count = agent.parameters['event_count'];
        let name = agent.parameters['coordinator_name'];
        let phone = agent.parameters['coordinator_phone'];
        let isoDateString = agent.parameters['event_date'];
        let institution = agent.parameters['event_institution'];
        let city = agent.parameters['event_city'];
        let feedback = agent.parameters['event_feedback'];

		if(type) {
          	console.log(type, event_day);
	      	if (type != "group-meditation" && !event_day){
              	console.log("Need which day");
				agent.add(`Is is day-1, day-2 or day-3 of the event? If it is a one day event just enter \"one day event\". For a follow up event, enter \"Follow Up\"`);			
            }
        }

        let allParametersReady = false;
      	// Check if we have all required params
        if (type && count && name && phone && isoDateString && institution &&  city && feedback) {
	        allParametersReady = true;
            console.log("Got all required params");
        }

        if(allParametersReady){
            let center = findCity(city);
            let date = cleanDate(isoDateString);
            console.log(center.city, center.zone, center.country);
            agent.add(`Okay, ${count} attended ${type} on ${date} at ${institution} in ${center.city}, Is this correct ${name}? Please reply with 'yes' or 'no'.`);
        }
        return;
    }
  
    function writeToDb (agent) {
        // Get parameter from Dialogflow with the string to add to the database
        const context = agent.getContext('eventinfo-followup');
        let type = context.parameters['event_type'];
        let event_day = context.parameters['event_day'];
        let count = context.parameters['event_count'];
        let name = context.parameters['coordinator_name'];
        let phone = context.parameters['coordinator_phone'];
        let isoDateString = context.parameters['event_date'];
        let institution = context.parameters['event_institution'];
        let center = findCity(context.parameters['event_city']);
        let feedback = context.parameters['event_feedback'];
        let date = cleanDate(isoDateString);
        console.log(agent.requestSource);
        console.log(agent.originalRequest['payload']['data']);
        let source = agent.requestSource;
        let source_data="";
      	if(source) {
	        source_data = JSON.stringify(agent.originalRequest['payload']['data']);
        } else {
        	source = "Unknown";
            source_data = "Maybe DialogFlow Console";
        }
        let evuuid = uuidv4();
        let eventSummary = {
            "id": evuuid,
            "name": name,
          	"phone": phone,
            "type": type,
            "event_day": event_day,
            "count": count,
            "date": date,
            "institution": institution,
            "city": center.city,
            "zone": center.zone,
            "country": center.country,
            "feedback": feedback,
            "source": source,
            "source_data": source_data
        }
        const databaseEntry = eventSummary
        const dialogflowAgentRef = db.collection('event-summary').doc();
        return db.runTransaction(t => {
            t.set(dialogflowAgentRef, {entry: databaseEntry});
            writeToBq(eventSummary);
            return Promise.resolve('Write complete');
        }).then(doc => {
            let finalResponse = "Thanks for submitting the information and all the best.\n\n";
            finalResponse += "Please submit the complete feedback with attendee information (if available) at our Events Portal: events.heartfulness.org\n\n";
            finalResponse += "You can view the latest reports on Heartfulness Connect activities here: http://bit.ly/hfn-connect-report\n\n";
            finalResponse += "If you like this app, please inform other coordinators to use the app by sending the following *WhatsApp message to +14155238886*:\
                                \n*join harlequin-tuatara*\n\n";
            finalResponse += "Or if you prefer *Telegram*, start a chat with @hfn_event_bot to use this app\n\n";
            if(connectContact(type) != "") {
                finalResponse += "Please contact " + connectContact(type) + " for any questions or to send photos of the event.\n\n";
            }
            finalResponse += "For any help or feedback on this application, please email it@heartfulness.org."

            agent.add(finalResponse);
            
        }).catch(err => {
            console.log(`Error writing to Firestore: ${err}`);
            agent.add(`Looks like we had some problem capturing this information. This could be due to some internal error. Can you please email itsupport@heartfulness.org with the screenshot? Thanks and apologies for the inconvenience.`);
        });
    }

    // Run the proper function handler based on the matched Dialogflow intent name
    let intents = new Map();
    intents.set('Default Welcome Intent', welcomeMessage);
    intents.set('event.info', askForConfirmation);
    intents.set('event.info.yes', writeToDb);
    agent.handleRequest(intents);
});