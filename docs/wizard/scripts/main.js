import config from '../config/config.js';
import view from './view.js';
import wizard from './wizard.js';

//Extra imports

// PureCloud
const platformClient = require('platformClient');
const client = platformClient.ApiClient.instance;
const ClientApp = window.purecloud.apps.ClientApp;
let TelephonyApiInstance = new platformClient.TelephonyProvidersEdgeApi();


// API 
const usersApi = new platformClient.UsersApi();
const integrationsApi = new platformClient.IntegrationsApi();

// Constants
const appName = config.appName;

// Variables
let pcLanguage = localStorage.getItem(appName + ':language') ||
    config.defaultLanguage;
let pcEnvironment = localStorage.getItem(appName + ':environment') ||
    config.defaultPcEnvironment;
let clientApp = null;
let userMe = null;


/**
 * Get query parameters for language and purecloud region
 */
function queryParamsConfig() {
    // Get Query Parameters
    const urlParams = new URLSearchParams(window.location.search);
    let tempLanguage = urlParams.get(config.languageQueryParam);
    let tempPcEnv = urlParams.get(config.pureCloudEnvironmentQueryParam);

    // Override default and storage items with what's on search query
    if (tempLanguage) {
        pcLanguage = tempLanguage;
        localStorage.setItem(appName + ':language', pcLanguage);
    }
    if (tempPcEnv) {
        pcEnvironment = tempPcEnv;
        localStorage.setItem(appName + ':environment', pcEnvironment);
    }
}

/**
 * Authenticate with PureCloud
 */
function authenticatePureCloud() {
    client.setEnvironment(pcEnvironment);
    client.setPersistSettings(true, appName);
    return client.loginImplicitGrant(
        config.clientID,
        config.wizardUriBase + 'index.html'
    );
}

/**
 * Get user details with its roles
 * @returns {Promise} usersApi result
 */
function getUserDetails() {
    let opts = { 'expand': ['authorization'] };
    //

    //
    return usersApi.getUsersMe(opts);
}

/**
 * Checks if the PureCloud org has the premium app product enabled
 * @returns {Promise}
 */
function validateProductAvailability() {
    return integrationsApi.getIntegrationsTypes({})
        .then((data) => {
            if (data.entities.filter((integType) => integType.id === appName)[0]) {
                console.log("PRODUCT AVAILABLE");
                return (true);
            } else {
                console.log("PRODUCT NOT AVAILABLE");
                return (false);
            }
        });
}

/**
 * Setup function
 * @returns {Promise}
 */
function setup() {
    view.showLoadingModal('Loading...');
    console.log("ShowLoadingModal");
    view.hideContent();

    queryParamsConfig();
    console.log("queryParamsConfig");
    // Setup Client App
    clientApp = new ClientApp({
        pcEnvironment: pcEnvironment
    });
    return authenticatePureCloud()
        .then(() => {
            console.log("authenticatePureCloud");
            return getUserDetails();
        })
        .then((user) => {
            userMe = user;
            console.log("getUserDetails");
            view.showUserName(user);

            return setPageLanguage();
        })
        .then(() => {
            wizard.setup(client, userMe);
            console.log("runPageScript");
            return runPageScript();
        })
        .then(() => {
            view.hideLoadingModal();
        })
        .catch((e) => console.error(e));
}

/**
 * Sets and loads the language file based on the pcLanguage global var
 * @returns {Promise}
 */
function setPageLanguage() {
    return new Promise((resolve, reject) => {
        let fileUri =
            `${config.wizardUriBase}assets/languages/${pcLanguage}.json`;
        $.getJSON(fileUri)
            .done(data => {
                Object.keys(data).forEach((key) => {
                    let els = document.querySelectorAll(`.${key}`);
                    for (let i = 0; i < els.length; i++) {
                        els.item(i).innerText = data[key];
                    }
                })
                resolve();
            })
            .fail(xhr => {
                console.log('Language file not found.');
                resolve();
            });
    });
}

/**
 * Runs page specific script.
 * @returns {Promise}
 */
function runPageScript() {
    return new Promise((resolve, reject) => {
        let pathParts = window.location.pathname.split('/');

        let page = pathParts[pathParts.length - 1];
        if (page == "") {
            page = "index.html";
        }
        console.log("Entered pagescript");
        // Run Page Specific Scripts
        switch (page) {
            case 'index.html':
                console.log("index page");
                // Button Handler
                // let elNextBtn = document.getElementById('next');
                // elNextBtn.addEventListener('click', () => {
                //     window.location.href = './custom-setup.html';
                // });

                //Extra functionality here **********************************************************************

                //CUSTOM-SETUP PAGE STUFF

                usersApi.getUsersMe()
                    .then((data) => {
                        console.log("EMAIL");
                        var orgApi = new platformClient.OrganizationApi();
                        console.log("orgApi = " + orgApi);
                        orgApi.getOrganizationsMe().then(function (result) {
                            console.log("Inside getOrganizationsMe");
                            let opts = {
                                'pageSize': 25, // Number | Page size
                                'pageNumber': 1, // Number | Page number
                                'sortBy': "number", // String | Sort by
                                'sortOrder': "ASC", // String | Sort order

                            };

                            TelephonyApiInstance.getTelephonyProvidersEdgesDids(opts)
                                .then((did) => {
                                    let DiD = [];
                                    for (let i = 0; i < did.entities.length; i++) {
                                        DiD.push(did.entities[i].phoneNumber.toString());
                                    }
                                    console.log(DiD);
                                    window.sessionStorage.setItem('DiD', DiD);
                                    document.getElementById("product-available-org").textContent = result.name;
                                    document.getElementById("product-available-email").textContent = data.email;
                                    document.getElementById("product-available-did").textContent = DiD.toString();


                                    let region = "US";
                                    window.sessionStorage.setItem('name', data.name);
                                    window.sessionStorage.setItem('orgName', result.name);
                                    window.sessionStorage.setItem('orgId', result.id);
                                    window.sessionStorage.setItem('appId', 'TestingAppId');
                                    window.sessionStorage.setItem('email', data.email);
                                    window.sessionStorage.setItem('location', region);
                                    window.sessionStorage.setItem('DiD', window.sessionStorage.getItem('DiD').toString());


                                    //INSTALL PAGE STUFF

                                    let name = window.sessionStorage.getItem('name');
                                    let orgName = window.sessionStorage.getItem('orgName');
                                    let orgId = window.sessionStorage.getItem('orgId');
                                    let appId = window.sessionStorage.getItem('appId');
                                    let email = window.sessionStorage.getItem('email');
                                    let location = window.sessionStorage.getItem('location');
                                    DiD = window.sessionStorage.getItem('DiD').toString();

                                    let postData = {
                                        name: name,
                                        orgName: orgName,
                                        orgId: orgId,
                                        appId: appId,
                                        email: email,
                                        location: location,
                                        DiD: DiD,
                                    };

                                    let elStartBtn = document.getElementById('next');
                                    elStartBtn.addEventListener('click', () => {


                                        view.showLoadingModal('Installing..');

                                        wizard.install(postData)
                                            .then(() => {
                                                window.location.href = './finish.html';
                                            })
                                            .catch(e => console.error(e))
                                    });

                                })
                                .catch((err) => {
                                    console.log('There was a failure calling getTelephonyProvidersEdgesDids');
                                    console.error(err);
                                });





                            resolve('Successful');

                        }).then((message) => {
                            console.log('Resolve message:' + message);
                        }).catch((err) => {
                            console.log('There was a failure calling getOrganizationsMe');
                            console.error(err);
                            reject('Failed');
                        });
                    })
                    .catch((err) => {
                        console.log('There was a failure calling getUsersMe');
                        console.error(err);
                        reject('Failed');
                    });





                // ****************************************************************************************************

                validateProductAvailability()
                    .then((isAvailable) => {
                        if (isAvailable) {
                            view.showProductAvailable();
                        } else {
                            view.showProductUnavailable();
                        }

                        return wizard.isExisting();
                    })
                    // Check if has an existing installation
                    .then((exists) => {
                        if (exists) {
                            window.location.href = config.premiumAppURL;
                        } else {
                            view.showContent();
                            resolve();
                        }
                    });
                break;
            // case 'custom-setup.html':
            //     console.log("custom-setup page");


            //     let options = { 
            //         'pageSize': 25, // Number | Page size
            //         'pageNumber': 1, // Number | Page number
            //         'sortBy': "number", // String | Sort by
            //         'sortOrder': "ASC", // String | Sort order

            //       };

            //       TelephonyApiInstance.getTelephonyProvidersEdgesDids(options)
            //         .then((data) => {
            //             let DiD = [];
            //             //console.log(data.entities[0].phoneNumber);
            //             for(let i=0; i<data.entities.length; i++){
            //                 DiD.push(data.entities[i].phoneNumber);
            //             }
            //             console.log(DiD);
            //           //console.log(`getTelephonyProvidersEdgesDids success! data: ${JSON.stringify(data, null, 2)}`);
            //           window.sessionStorage.setItem('DiD', DiD);
            //         })
            //         .catch((err) => {
            //           console.log('There was a failure calling getTelephonyProvidersEdgesDids');
            //           console.error(err);
            //         });

            //     // Button Handler
            //     let elSetupBtn = document.getElementById('next');
            //     elSetupBtn.addEventListener('click', () => {
            //         window.location.href = './install.html';
            //         let e = document.getElementById('region');
            //         let region = e.options[e.selectedIndex].text;
            //         console.log(region);
            //         window.sessionStorage.setItem('region', region);


            //         // view.showLoadingModal('Installing..');
            //         // wizard.install()
            //         // .then(() => {
            //         //     window.location.href = './install.html';
            //         // })
            //         // .catch(e => console.error(e))
            //     });

            //     resolve();
            //     view.showContent();
            //     break;
            // case 'install.html':
            //     console.log("install page");
            //     //Get selected region
            //     let DiD = window.sessionStorage.getItem('DiD');
            //     let region = window.sessionStorage.getItem('region');
            //     console.log(region, DiD);
            //     // Button Handler
            //     let elStartBtn = document.getElementById('start');
            //     elStartBtn.addEventListener('click', () => {


            //         view.showLoadingModal('Installing..');

            //         wizard.install(region, DiD)
            //             .then(() => {
            //                 window.location.href = './finish.html';
            //             })
            //             .catch(e => console.error(e))
            //     });

            //     resolve();
            //     view.showContent();
            //     break;
            case 'finish.html':
                console.log("finish page");
                view.showContent();
                setTimeout(() => {
                    window.location.href = config.premiumAppURL;
                }, 2000);

                resolve();
                break;
            case 'uninstall.html':
                console.log("uninstall page");
                alert("The uninstall button is for development purposes only. Remove this button before demo.");

                view.showContent();
                view.showLoadingModal('Uninstalling...');

                wizard.uninstall()
                    .then(() => {
                        setTimeout(() => {
                            window.location.href = config.wizardUriBase
                                + 'index.html';
                        }, 2000);
                    });
                resolve();
                break;
            default:
                reject('Unknown page');
                break;
        }
    });
}


setup();

// Test get user data and write to file


