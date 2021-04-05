const https = require('https');

Utils = {
	IsJson: str => {
		try {
			JSON.parse(str);
		}
		catch (e) {
			return false;
		}
		return true;
	}
};


//Simple function to add number of days to today's date, and return said date
function addDays(date, days) {
	var result = new Date(date);
	console.log(result);
	console.log(result.getDate());
	console.log(days);
	result.setDate(result.getDate() + days);
	console.log(result);
	return result;
}


//Checks the response back from the API request to look for error
function checkForError(jsonResponse, checkedField, errorMessage) {
	console.log("checkForError: " + JSON.stringify(jsonResponse));
	if (JSON.stringify(jsonResponse).indexOf(checkedField) == -1) {
		if (JSON.stringify(jsonResponse).indexOf("<h3>The resource you are looking for might have been removed") > -1) {
			jsonResponse = new Object()
			jsonResponse["message"] = "The resource you are looking for might have been removed, had its name changed, or is temporarily unavailable.";
			jsonResponse["status"] = 404;
		}
		else if (JSON.stringify(jsonResponse).indexOf("</b>An application error occurred on the server.") > -1) {
			jsonResponse = new Object()
			jsonResponse["message"] = "An application error occurred on the server.";
			jsonResponse["status"] = 500;
		}
		jsonResponse["error"] = errorMessage;
		throw new Error(JSON.stringify(jsonResponse));
	}
}


//Checks if the string passed is valid Json
function isJsonString(str) {
	try {
		JSON.parse(str);
	}
	catch (e) {
		return false;
	}
	return true;
}


//Boilerplate code to make the API calls (it just works, I hardly know how. Ask Bundy)
function makeCall(host, port, method, path, headers, data) {
	var options = {};
	options.host = host;
	options.port = port;
	options.method = method;
	options.path = path;
	options.headers = headers;

	return new Promise((resolve, reject) => {
		var req = https.request(options, function (res) {
			var body = "";
			console.log("statusCode: ", res.statusCode);
			res.on('data', function (data) {
				body += data;
			});
			res.on('end', function () {
				//here we have the full response, html or json object
				if (Utils.IsJson(body)) {
					result = JSON.parse(body);
					result["status"] = res.statusCode;
					resolve(result);
				}
				else {
					if (body) {
						resolve(body);
					}
					else {
						resolve('Ok');
					}
				}
			});
			res.on('error', function (e) {
				console.log("Got error: " + e.message);
			});
		});
		req.on('error', (error) => {
			console.log(error);
			reject(error);
		});

		if (data) {
			req.write(data);
		}
		else {
			req.write("");
		}
		req.end();
	})
}


//Pauses the program for the specified number of milliseconds
function sleepMode(ms) {
	return new Promise(resolve => {
		setTimeout(resolve, ms)
	})
}


async function duplicateAccount(accountName, attachIDs, createUsers, accountExpires, planDurationDays, donorAccountID, baseUrl, platformAdminUsername, platformAdminPassword, overwriteAccount, notificationEmails, allowedNumbers, genesysIds) {
	res = new Object()
	try {
		if (overwriteAccount) {
			console.log("Performing overwrite");
			await sleepMode(1000);
		}

		//Get platform admin key token
		platformAdminKeyToken = await makeCall(baseUrl, 443, 'POST', '/cyarawebapi/v3.0/user/apitoken', {
			'Authorization': 'Basic ' + new Buffer.from(platformAdminUsername + ':' + platformAdminPassword).toString('base64')
		}, '');

		checkForError(platformAdminKeyToken, "token", "Failed to generate platform admin key/token");

		//Get the key and token we'll be using for all the 3.0 calls
		var platformAdminKey = platformAdminKeyToken["key"];
		var platformAdminToken = platformAdminKeyToken["token"];


		//Get master account info. Requires Administration
		accountDetails = await makeCall(baseUrl, 443, 'GET', '/cyarawebapi/v3.0/accounts/' + donorAccountID, {
			'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
			'Content-Type': 'application/json'
		});

		checkForError(accountDetails, "accountId", "Failed to get master account details");

		console.log(accountDetails);
		console.log("Got Master Account Details");

		/*
		Remove the invalid entries from accountDetails.
		Invalid because this json will be used to create new account,
		and these fields cannot be present
		*/
		delete accountDetails["accountId"], delete accountDetails["url"], delete accountDetails["dateCreated"];

		//Assign new values to account json for new account creation
		if (accountExpires) {
			var accountExpireDate = new Date();
			console.log(accountExpireDate);
			accountExpireDate = addDays(accountExpireDate, planDurationDays + 1);
			console.log(accountExpireDate);
			accountDetails["dateExpires"] = accountExpireDate.toISOString();
		}
		else {
			accountDetails["dateExpires"] = null;
		}
		accountDetails["name"] = accountName;
		accountDetails["dateActivated"] = new Date().toISOString();
		accountDetails["notificationEmails"] = notificationEmails;
		accountDetails.settings.voice.inboundWhitelist = allowedNumbers;
		//accountDetails.settings.voice.inboundWhitelist = ["1234567788","1234567890"];

		console.log("accountDetails: %j", accountDetails);
		await sleepMode(1000);

		//Take the modified info and create the new account. Requires PlatformAdmin
		duplicatedAccount = await makeCall(baseUrl, 443, 'POST', '/cyarawebapi/v3.0/accounts', {
				'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
				'Content-Type': 'application/json'
			},
			JSON.stringify(accountDetails)
		);

		//This variable will be assigned the ID of the new account we're building out
		var accountID = null;

		console.log(JSON.stringify(duplicatedAccount));

		//This account already exists and the user is request an overwrite
		if ((JSON.stringify(duplicatedAccount).includes("The name is already being used") && overwriteAccount)) {
			console.log("OVERWRITE INITIATED");

			//Get the account with the already utilized name. Requires UserAdmin
			allAccounts = await makeCall(baseUrl, 443, 'GET', '/cyarawebapi/v3.0/accounts/?pageSize=1000', {
				'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
				'Content-Type': 'application/json'
			});

			checkForError(allAccounts, "\"status\":200", "Failed to grab account to overwrite");

			//Search through the accounts list and find the matching account by name, grabbing the ID
			var accountsArr = allAccounts.results;

			for (var i = 0; i < accountsArr.length; i++) {
				if (accountsArr[i].name === accountName) {
					accountID = accountsArr[i].accountId;
					break;
				}
			}
		}
		else { //The account was not a dupe, or we're not overwriting
			console.log("Checking account");
			checkForError(duplicatedAccount, "accountId", "Failed to create the new shell account");
			console.log("Generated duplicate shell account");

			accountID = duplicatedAccount["accountId"];
		}


		console.log(duplicatedAccount);
		console.log("new accountID: " + accountID);
		await sleepMode(1000);


		console.log("Start getting all plans");

		//Get all the plan IDs from the master account. Requires Administration
		masterPlans = await makeCall(baseUrl, 443, 'GET', '/cyarawebapi/v3.0/accounts/' + donorAccountID + '/plans?pageSize=1000', {
			'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
			'Content-Type': 'application/json'
		});

		checkForError(masterPlans, "\"status\":200", "Failed to get master account plan IDs");

		console.log("Retrieved plans from master account");
		console.log(masterPlans);

		var oldPlanIDs = [];
		var newPlanIDs = [];

		/*
		This is the big loop of duplicating the plans.
		The plans are grabbed from the master/donor account.
		They are then recreated on the new account,
		but with the notificationEmails and planDurationDays specified
		*/
		var plans = masterPlans.results;
		for (var i = 0; i < plans.length; i++) {
			console.log(plans[i]);
			console.log("Retrieving plan from master account");

			//Get the plan detail from the master account. Requires Administration
			planDetails = await makeCall(baseUrl, 443, 'GET', '/cyarawebapi/v3.0/accounts/' + donorAccountID + '/plans/' + plans[i].planId, {
				'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
				'Content-Type': 'application/json'
			});

			checkForError(planDetails, "\"status\":200", "Failed to get master account plan ID");

			console.log(planDetails);

			//set the planExpireDate to the correct number of duration days specified by user
			var planExpireDate = new Date();
			planExpireDate = addDays(planExpireDate, planDurationDays);

			oldPlanIDs.push(planDetails.planId);
			await sleepMode(1000);

			var minFreq = "";
			if (planDetails.type === "Pulse" || planDetails.type === "PulseOutbound") {
				minFreq = ", 'minimumFrequency': 1";
			}
			console.log("Creating plan on new account");
			console.log("{ 'accountId': '" + accountID + "', 'name': '" + planDetails.name + "', 'subType': '" + planDetails.subType + "', 'note': '"+ genesysIds[0].OrgId + "\n" + genesysIds[0].AppId + "', 'channel': '" + planDetails.channel + "', 'type': '" + planDetails.type + "', 'startDate': '" + planDetails.startDate + "', 'endDate': '" + planExpireDate.toISOString() + "', 'concurrency': " + planDetails.concurrency + ", 'settings': " + JSON.stringify(planDetails.settings) + ", 'notificationEmails': " + JSON.stringify(notificationEmails) + minFreq + " }");
			//Create a plan on the new account. Requires PlatformAdmin
			createdPlan = await makeCall(baseUrl, 443, 'POST', '/cyarawebapi/v3.0/accounts/' + accountID + '/plans', {
					'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
					'Content-Type': 'application/json'
				},
				"{ 'accountId': '" + accountID + "', 'name': '" + planDetails.name + "', 'subType': '" + planDetails.subType + "', 'note': '" + genesysIds[0].OrgId + "\n" + genesysIds[0].AppId + "', 'channel': '" + planDetails.channel + "', 'type': '" + planDetails.type + "', 'startDate': '" + planDetails.startDate + "', 'endDate': '" + planExpireDate.toISOString() + "', 'concurrency': " + planDetails.concurrency + ", 'settings': " + JSON.stringify(planDetails.settings) + ", 'notificationEmails': " + JSON.stringify(notificationEmails) + minFreq + " }"
			);


			/*
			Check if there already exists a plan on the new account with the same name.
			If there is, grab its ID.
			This only happens when an overwrite is happening, and the previous attempt(s)
			created this plan already.
			*/
			if (JSON.stringify(createdPlan).includes("Plan name must be unique within an account")) {
				console.log("Getting existing plan");

				//Get the plan list from the new account. Requires Administration
				planList = await makeCall(baseUrl, 443, 'GET', '/cyarawebapi/v3.0/accounts/' + accountID + '/plans?pageSize=1000', {
					'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
					'Content-Type': 'application/json'
				});

				checkForError(planList, "\"status\":200", "Failed to get existing plans");

				planListResults = planList.results;

				for (var i = 0; i < planListResults.length; i++) {
					if (planListResults[i].name === planDetails.name) {
						console.log("Pre-existing plan found: " + planListResults[i].planId);
						newPlanIDs.push(planListResults[i].planId);
						break;
					}
				}
			}
			else { //The plan created did not already exist on the new account, so check for errors and add ID
				checkForError(createdPlan, "\"status\":200", "Failed to create plan on new account");

				console.log(createdPlan);
				newPlanIDs.push(createdPlan.planId);
			}


			await sleepMode(1000);
		}

		console.log(masterPlans);
		await sleepMode(1000);


		//For each campaign: GET a campaign. Store the TCs it uses. One by one, check if we already exported that TC by checking if it's in our KVP
		//If it isn't, export those TCs, and add them to a KVP old vs new ID. Then create the campaign
		//When all the campaigns are created, export the rest of the TCs, making sure we don't re-export a TC

		console.log("List master campaigns");
		//List Campaigns from donor account. Requires Administration
		campaignList = await makeCall(baseUrl, 443, 'GET', '/cyarawebapi/v3.0/accounts/' + donorAccountID + '/campaigns?channel=Voice', {
            'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
			'Content-Type': 'application/json'
		});

		checkForError(campaignList, "\"status\":200", "Failed to list master account campaigns");


		console.log("List shell campaigns");
		//List Campaigns from shell account. Requires Administration
		shellCampaignList = await makeCall(baseUrl, 443, 'GET', '/cyarawebapi/v3.0/accounts/' + accountID + '/campaigns?channel=Voice', {
            'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
			'Content-Type': 'application/json'
		});

		checkForError(shellCampaignList, "\"status\":200", "Failed to list shell account campaigns");

		var shellCampaigns = shellCampaignList.results;

		var shellCampaignNames = [];

		for (var x = 0; x < shellCampaigns.length; x++) {
			shellCampaignNames.push(shellCampaigns[x].name)
		}

		console.log(campaignList);
		await sleepMode(1000);

		var campaigns = campaignList.results;

		var oldNewTCIds = {};
		var oldTCIDs = [];
		var newTCIDs = [];

		//Loop through the donor campaigns, checking if they don't yet exist on shell account
		for (var i = 0; i < campaigns.length; i++) {
			if (shellCampaignNames.indexOf(campaigns[i].name) == -1) { //Doesn't exist on shell
				console.log(campaigns[i]);
				console.log("Getting campaign from master account");

				//Get Campaign from donor. Requires Administration
				campaign = await makeCall(baseUrl, 443, 'GET', '/cyarawebapi/v3.0/accounts/' + donorAccountID + '/campaigns/' + campaigns[i].campaignId, {
                    'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
                    'Content-Type': 'application/json'
				});

				checkForError(campaign, "\"status\":200", "Failed to get master account campaign");

				console.log(campaign);

				var campaignTestCases = campaign.testCases;

				/*
				If there are test cases in this donor campaign, loop through all of them,
				and import them into the shell account, storing their ID.
				*/
				if (campaignTestCases != null) {
					for (var n = 0; n < campaignTestCases.length; n++) {
						console.log(campaignTestCases[n]);

						if (!oldTCIDs.includes(campaignTestCases[n].testCaseId)) {

							console.log("getting TCXML from master account for campaign");

							//Get TCXML. Requires Administration
							testCaseXML = await makeCall(baseUrl, 443, 'GET', '/cyarawebapi/v3.0/accounts/' + donorAccountID + '/testcases/cyaraxml?testCaseIds=' + campaignTestCases[n].testCaseId, {
                                'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
                                'Content-Type': 'application/json'
							});

							checkForError(testCaseXML, "TestSpecification", "Failed to get master account TCXML for campaign");

							await sleepMode(1000);

							console.log("Importing TCXML into new account for campaign");

							//Import TCXML. Requires Administration
							importTestCase = await makeCall(baseUrl, 443, 'POST', '/cyarawebapi/v3.0/accounts/' + accountID + '/testcases/import', {
								'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
                                'Content-Type': 'application/json'
							}, testCaseXML);

							checkForError(importTestCase, "\"error\":[]", "Failed to import TCXML into new account for campaign");

							console.log(importTestCase);
							await sleepMode(1000);

							var importResult = importTestCase.results;

							var newTCId = -1;

							//Grab and store the new test case's ID
							for (var x = 0; x < importResult.length; x++) {
								tcXPath = importResult[x].xPath;
								if (tcXPath.indexOf("/TestCases/") > -1) {
									newTCId = importResult[x].id;
								}
							}
							oldTCIDs.push(campaignTestCases[n].testCaseId);
							newTCIDs.push(newTCId);
							//console.log('old ' + campaignTestCases[n].testCaseId + ' new ' + newTCId);
						}

						campaignTestCases[n].testCaseId = newTCIDs[oldTCIDs.indexOf(campaignTestCases[n].testCaseId)];
					}
				}

				//Change the donor plan ID to the respective plan's ID on the shell account
				campaignPlan = campaign.plan;
				campaignPlan.planId = newPlanIDs[oldPlanIDs.indexOf(campaignPlan.planId)];

				console.log(campaign);
                console.log("creating campaign on new account");
                
                // patch up the model as the get and the post are different :(
                campaign.planType = campaign.plan.type;
                campaign.planId = campaign.plan.planId;

				//Create Campaign. Requires Administration
				createCampaign = await makeCall(baseUrl, 443, 'POST', '/cyarawebapi/v3.0/accounts/' + accountID + '/campaigns', {
                    'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
                    'Content-Type': 'application/json'
					},
					JSON.stringify(campaign)
				);

				checkForError(createCampaign, "campaignId", "Failed to create campaign on new account");

				console.log(createCampaign);

				await sleepMode(1000);
			}
		}


		console.log("listing test cases on master account");

		//List Test Cases. Requires Administration.
		testCaseList = await makeCall(baseUrl, 443, 'GET', '/cyarawebapi/v3.0/accounts/' + donorAccountID + '/testcases?pageSize=1000', {
			'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
            'Content-Type': 'application/json'
		});

		console.log(JSON.stringify(testCaseList));

		if (!JSON.stringify(testCaseList).includes("Ok")) {
			checkForError(testCaseList, "testCaseId", "Failed to list test cases on master account");
		}
		var testCases = testCaseList.testCase;

		/*
		Loop through the rest of the test cases on the donor account not used in campaigns,
		and import them into the shell account.
		*/
		if (testCases != null) {
			for (var i = 0; i < testCases.length; i++) {
				console.log(testCases[i]);

				if (!oldTCIDs.includes(testCases[i].testCaseId)) {

					console.log("getting TCXML from master account");

					//Get TCXML. Requires Administration
					testCaseXML = await makeCall(baseUrl, 443, 'GET', '/cyarawebapi/v3.0/accounts/' + donorAccountID + '/testcases/cyaraxml?testCaseIds=' + testCases[i].testCaseId, {
						'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
                        'Content-Type': 'application/json'
					});
					checkForError(testCaseXML, "TestSpecification", "Failed to get master account TCXML");

					console.log(testCaseXML);
					await sleepMode(1000);

					console.log("Importing TCXML into new account");

					//Import TCXML. Requires Administration
					importTestCase = await makeCall(baseUrl, 443, 'POST', '/cyarawebapi/v3.0/accounts/' + accountID + '/testcases/import', {
						'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
                        'Content-Type': 'application/json'
					}, testCaseXML);

					checkForError(importTestCase, "\"error\":[]", "Failed to import TCXML into new account");

					console.log(importTestCase);

					await sleepMode(1000);
				}
			}
			console.log(testCases.length + " test cases duplicated");
		}

		//Start the process for duplicating CX Models
		console.log("listing CX Models on master account");

		//List CX Models on master/donor account
		listCXModels = await makeCall(baseUrl, 443, 'GET', '/cyarawebapi/v3.0/accounts/' + donorAccountID + '/models', {
			'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
			'Content-Type': 'application/json'
		});

		checkForError(listCXModels, "\"status\":200", "Failed to list CXModels on master account");

		//List CX Models on new/shell account
		shellCXModels = await makeCall(baseUrl, 443, 'GET', '/cyarawebapi/v3.0/accounts/' + accountID + '/models', {
			'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
			'Content-Type': 'application/json'
		});

		checkForError(shellCXModels, "\"status\":200", "Failed to list CXModels on shell account");

		cxModelResults = listCXModels.results;

		shellCXModelResults = shellCXModels.results;

		var shellCXModelNames = [];

		//Grab and store all the current CX Models on the new/shell account
		for (var x = 0; x < shellCXModelResults.length; x++) {
			shellCXModelNames.push(shellCXModelResults[x].name);
		}

		//Loop through the CX Models on the master/donor account and add any that aren't on the new/shell account
		for (var i = 0; i < cxModelResults.length; i++) {

			//If the shell account doesn't have this donor CX model, let's import it
			if (shellCXModelNames.indexOf(cxModelResults[i].name) == -1) {

				console.log("Getting CX Model from master account")
				getCXModel = await makeCall(baseUrl, 443, 'GET', '/cyarawebapi/v3.0/accounts/' + donorAccountID + '/models/' + cxModelResults[i].modelId, {
					'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
					'Content-Type': 'application/json'
				});

				checkForError(getCXModel, "modelId", "Failed to get CX Model from master account");

				console.log(getCXModel);

				console.log("Importing CX Model into new account");

				importCXModel = await makeCall(baseUrl, 443, 'POST', '/cyarawebapi/v3.0/accounts/' + accountID + '/models', {
						'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
						'Content-Type': 'application/json'
					},
					JSON.stringify(getCXModel)
				);

				checkForError(importCXModel, "modelId", "Failed to import CX Model into new account");

				console.log(importCXModel);
				await sleepMode(1000);
			}
		}

		//Loop to attach requested known user IDs to new account
		for (var i = 0; i < attachIDs.length; i++) {
			var knownUserID = attachIDs[i];
			console.log("Attaching user " + knownUserID);

			//Attach user to account. Requires UserAdmin
			attachUser = await makeCall(baseUrl, 443, 'PUT', '/cyarawebapi/v3.0/accounts/' + accountID + '/users/' + knownUserID, {
				'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
				'Content-Type': 'application/json'
			});

			checkForError(attachUser, "Ok", "Failed to attach user to new account");

			console.log("Attached user");
			console.log(attachUser);

			await sleepMode(1000);
		}


		var userFailed = false;

		//Loop to create and attach new users to new account
		for (var newUserCnt = 0; newUserCnt < createUsers.length; newUserCnt++) {

			var customerFirstName = createUsers[newUserCnt].customerFirstName;
			var customerLastName = createUsers[newUserCnt].customerLastName;
			var customerCompany = createUsers[newUserCnt].customerCompany;
			var customerPhone = createUsers[newUserCnt].customerPhone;
			var customerEmail = createUsers[newUserCnt].customerEmail;
			var customerPassword = createUsers[newUserCnt].customerPassword;


			console.log("Creating user");

			//Create user. Requires UserAdmin
			var createdUser = await makeCall(baseUrl, 443, 'POST', '/cyarawebapi/v3.0/users', {
					'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
					'Content-Type': 'application/json'
				},
				"{ 'username': '" + customerFirstName.toLowerCase() + "." + customerLastName.toLowerCase() + "." + customerCompany.toLowerCase().replace(/ /g, ".") + "', 'firstname': '" + customerFirstName + "', 'lastname': '" + customerLastName + "', 'telephone': '" + customerPhone + "', 'mobile': null, 'email': '" + customerEmail + "', 'active': true, 'platformNotifications': false, 'fullScreen': true, 'defaultAccount': 0, 'roles': [ 'Administration', 'VirtualAgentAdministration', 'ExecutiveDashboardAdmin', 'UserAdmin' ], 'loginProviders': [ 'Identity' ], 'password': '" + customerPassword + "' }"
			);

			checkForError(createdUser, "userId", "Failed to create new user");

			console.log("Created user");
			console.log(createdUser);
			await sleepMode(5000);

			userID = createdUser["userId"];

			console.log("Attaching user");

			//Attach user to account. Requires UserAdmin
			attachUser = await makeCall(baseUrl, 443, 'PUT', '/cyarawebapi/v3.0/accounts/' + accountID + '/users/' + userID, {
				'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
				'Content-Type': 'application/json'
			});

			checkForError(attachUser, "Ok", "Failed to attach user to new account");

			console.log("Attached user");
			console.log(attachUser);

			await sleepMode(1000);

			console.log("Listing user's accounts");

			//Get all accounts on customer user. Requires UserAdmin
			listUserAccounts = await makeCall(baseUrl, 443, 'GET', '/cyarawebapi/v3.0/users/' + userID + '/accounts', {
				'Authorization': 'ApiKey ' + platformAdminKey + ':' + platformAdminToken,
				'Content-Type': 'application/json'
			});

			checkForError(listUserAccounts, "accountId", "Failed to list user's accounts");

			console.log("Got user accounts");
			console.log(listUserAccounts);

			var hasAccount = false;
			userAccountResults = listUserAccounts.results;


			for (var i = 0; i < userAccountResults.length; i++) {
				if (userAccountResults[i].accountId == accountID) {
					hasAccount = true;
					break;
				}
			}

			if (hasAccount) {
				console.log("This user is ready.");
			}
			else {
				console.log("Failed to create your user.")

				res = new Object()
				res["message"] = "Failed to create your user " + customerFirstName.toLowerCase() + "." + customerLastName.toLowerCase() + "." + customerCompany.toLowerCase().replace(" ", ".");
				res["status"] = 404;
				userFailed = true;
				break;
			}
		}
		if (!userFailed) {
			res = new Object()
			res["message"] = "Account duplicated. It is ready at https://" + baseUrl + "/cyarawebportal/" + accountID + "/home";
			res["status"] = 200;
		}

	}
	catch (error) {
		if (error.toString().indexOf("getaddrinfo ENOTFOUND") > -1) {
			console.log("Failed to connect to the Cyara server");

			res = new Object();
			res["message"] = "Failed to connect to the Cyara server";
			res["status"] = 500;
		}
		else {
			var errorMessage = error.message
			if (isJsonString(errorMessage)) {
				console.log("Handled error occurred: " + error);
				res = new Object();
				res = JSON.parse(error.message);
			}
			else {
				res = new Object()
				res["message"] = "An unexpected error occurred";
				res["error"] = errorMessage;
				res["status"] = 500;
			}
		}

		console.log(res);

	}
	var finalResponse = JSON.stringify(res);
	console.log("finalResponse:");
	console.log('\x1b[33m%s\x1b[0m', finalResponse);
}


//Read in and parse the parameters

// var clArgs = process.argv.slice(2);
// var inputParameters = clArgs[0];
// var inputJson = JSON.parse(inputParameters);

let myArgs = process.argv.slice(2);
let buff = Buffer.from(myArgs[0], 'base64');
let inputJson = JSON.parse(buff);
console.log(inputJson);

var accountName = inputJson["accountName"];
var attachIDs = inputJson["attachIDs"];
var createUsers = inputJson["createUsers"];
var accountExpires = inputJson["accountExpires"];
var planDurationDays = inputJson["planDurationDays"];
var donorAccountID = inputJson["donorAccountID"];
var baseUrl = inputJson["baseUrl"];
var platformAdminUsername = inputJson["platformAdminUsername"];
var platformAdminPassword = inputJson["platformAdminPassword"];
var overwriteAccount = inputJson["overwriteAccount"];
var notificationEmails = inputJson["notificationEmails"];
var allowedNumbers = inputJson["allowedNumbers"];
var genesys = inputJson["genesysIds"];
var genesysIds = [
	{
		"OrgId":genesys[0].orgId,
		"AppId":genesys[0].appId
	}
]



//Execute the heart of the duplication
duplicateAccount(accountName, attachIDs, createUsers, accountExpires, planDurationDays, donorAccountID, baseUrl, platformAdminUsername, platformAdminPassword, overwriteAccount, notificationEmails, allowedNumbers, genesysIds);
