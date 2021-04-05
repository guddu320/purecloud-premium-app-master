var express = require('express');
var nodemailer = require('nodemailer');
var path = require('path');
const fs = require('fs');
var generator = require('generate-password');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
require('dotenv').config();
require('winston-daily-rotate-file');
require('dotenv').config();
const { createLogger, format, transports } = require('winston');

// Winston logger configuration
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}
const dailyRotateFileTransport = new transports.DailyRotateFile({
  filename: `${logDir}/%DATE%-results.log`,
  datePattern: 'YYYY-MM-DD'
});

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
  ),
  transports: [
    new transports.Console({
      level: 'info',
      format: format.combine(
        format.colorize(),
        format.printf(
          info => `${info.timestamp} ${info.level}: ${info.message}`
        )
      )
    }),
    dailyRotateFileTransport
  ]
});


var app = express();
var sub = express();
sub.use(express.json({ limit: '1mb' }));


app.use(express.static(process.cwd() + '/docs'));
app.use(express.json({ limit: '1mb' }));

// Serve the app
app.listen(8080, () => console.log('Listening on 8080'));


// Handle post to mail 
app.post('/mail', (req, res) => {

  //Send email
  console.log("Post recieved");

  //Encode data to be prefilled as a base64 token
  let token = {"orgName": req.body.orgName,
      "name": req.body.name,
      "orgId": req.body.orgId,
      "appId": req.body.appId,
      "email": req.body.email,
      "location": req.body.location,
      "DiD": req.body.DiD
    };
    let buff = new Buffer.from(JSON.stringify(token),'utf-8');
    let APPROVAL_TOKEN = buff.toString('base64');

  let url = "http://localhost:8081/form?APPROVAL_TOKEN=" + APPROVAL_TOKEN;
    //Approval email body
    var html = fs.readFileSync(path.join(__dirname + '/AccountDuplicator/approver-email-template.html'), 'utf-8');

    let customer_details = "<span>" + "Org name: " + req.body.orgName + "</span><br>" +
    "<span>" + "Name: " + req.body.name + "</span><br>" +
    "<span>" + "Org Id: " + req.body.orgId + "</span><br>" +
    "<span>" + "App Id: " + req.body.appId + "</span><br>" +
    "<span>" + "Email: " + req.body.email + "</span><br>" +
    "<span>" + "Location: " + req.body.location + "</span><br>" +
    "<span>" + "DiD: " + req.body.DiD + "</span><br>";

    html = html.replace("CUSTOMER_DETAILS_HTML",customer_details);
    html = html.replace("APPROVAL_URL",url);
    
  var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SENDER_ID,   //Gmail account to send email from
      pass: process.env.SENDER_APP_PASSWORD    //App password
    }
  });

  const mailOptions = {
    from: process.env.SENDER_ID, // sender address
    to: process.env.SENDER_ID, // list of receivers
    subject: 'New Customer', 
    html: html
  };

  let p = new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, function (err, info) {
      if (err)
        reject('Email send failed : ' + err);
      else
        resolve('Email send success : ' + info);
    });
  });

  p.then((data) => {
    //console.log(data);
    logger.info(data);
    res.end();
  }).catch((err) => {
    //console.log(err);
    logger.info(err);
    res.end();
  });


});


//Account duplication form
sub.listen(8081, () => console.log('Listening on 8081'))

// sub.get('/success', (req, res) => {
//   var page = fs.readFileSync(path.join(__dirname + '/AccountDuplicator/Success.html'), 'utf-8');
//   res.send(page);
// });

//Get the approval from the approver, prefill and display a form
sub.get('/form', (req, res) => {
  console.log(req.query);

  //Decode approval token
  let data = Buffer.from(req.query.APPROVAL_TOKEN, 'base64').toString('utf-8');
  data = JSON.parse(data);

  let orgName = data.orgName;
  let name = data.name;
  let orgId = data.orgId;
  let appId = data.appId;
  let email = data.email;
  let location = data.location;
  let DiD = data.DiD;
  let password = generateRandomPassword(12);
  let accountName = data.orgName + " (Genesys)";

  var form = fs.readFileSync(path.join(__dirname + '/AccountDuplicator/index.html'), 'utf-8');
  //Replace placeholder values in the html script with the actual data
    form = form.replace("iname", name);
    form = form.replace("iorgName", orgName);
    form = form.replace("iorgId", orgId);
    form = form.replace("iappId", appId);
    form = form.replace("iemail", email);
    form = form.replace("iDiD", DiD);
    form = form.replace("ilocation", location);
    form = form.replace("ipassword", password);
    form = form.replace("iaccountName", accountName);
    
    res.send(form);
});


sub.post('/duplicate', (req, res) => {
  console.log("post recieved");
  console.log(req.body);
  let args = new Buffer.from(JSON.stringify(req.body)).toString('base64');
  //Execute the account duplication
  execScript('node AccountDuplicator/duplicate.js '+args);
  res.end();

  async function execScript(script) {
    try {
      const { stdout, stderr } = await exec(script);
      logger.info("Output: "+stdout+"\n\nError: "+ stderr);
      let html = fs.readFileSync(path.join(__dirname + '/AccountDuplicator/customer-email-template.html'), 'utf-8');
      //Success flow
      if(stdout.includes("\"message\":\"Account duplicated.")){
        //Email Sergio bot
        let sergio_html = html.replace("CUSTOMER_NAME,", "<p>Created account: "+req.body.accountName+"</p");
        sergio_html = sergio_html.replace("CUSTOMER_MESSAGE", "<p>Execution output: "+stdout+"</p><br><br><p>Error message: "+stderr+"</p>");
        email(process.env.SENDER_ID, process.env.SENDER_APP_PASSWORD, "godwin.nadarajan@cyara.com", "Account creation success!", "Execution output: "+stdout+"\n\nError message: "+stderr, sergio_html);
        //Email customer with account name and password
        let customer_html = html.replace("CUSTOMER_NAME,", "<p>Your Cyara account has been created!"+"</p");
        customer_html = customer_html.replace("CUSTOMER_MESSAGE", "<p>Here are your account details:</p><br><p>Account name: "+req.body.accountName+"</p><br><p>Password: "+req.body.createUsers[0].customerPassword+"</p>");
        let customerEmailBody = "Account name: "+req.body.accountName+"\nPassword: "+req.body.createUsers[0].customerPassword;
        let customerEmail = req.body.createUsers[0].customerEmail;
        email(process.env.SENDER_ID, process.env.SENDER_APP_PASSWORD, customerEmail, "Cyara account created", customerEmailBody, customer_html);
      }

      // Failure flow
      else{
        let html = fs.readFileSync(path.join(__dirname + '/AccountDuplicator/customer-email-template.html'), 'utf-8');
        //Email Sergio bot
        let sergio_html = html.replace("CUSTOMER_NAME,", "Failed to create account: "+req.body.accountName);
        sergio_html = sergio_html.replace("CUSTOMER_MESSAGE", "<p>Execution output: "+stdout+"</p><br><br><p>Error message: "+stderr+"</p>");
        email(process.env.SENDER_ID, process.env.SENDER_APP_PASSWORD, process.env.SERGIO_BOT_ID, "Account creation failed..", "Execution output: "+stdout+"\n\nError message: "+stderr, sergio_html);
        
        //Email Connector maintainer account creation failure with debug info
        email(process.env.SENDER_ID, process.env.SENDER_APP_PASSWORD, process.env.MARKETPLACE_CONNECTOR_MAINTAINER_ID, "Account creation failure info", "Execution output: "+stdout+"\n\nError message: "+stderr, sergio_html);
      }
      console.log('stdout:', stdout);
      console.log('stderr:', stderr);
    } catch (err) { console.error(err); }
  };


});

function email(fromId, appPassword, toId, subject, emailText, html) {
  var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: fromId,   //Gmail account to send email from
      pass: appPassword    //App password
    }
  });
  const mailOptions = {
    from: fromId, // sender address
    to: toId, // list of receivers
    subject: subject, // Subject line
    text: emailText,
    html: html
  };

  transporter.sendMail(mailOptions, function (err, info) {
    if (err){
      // logger.info("Email Failed!\n" + emailText + "\n");
      // logger.info(JSON.stringify(err));
      logger.info("Email Failed!\n"+JSON.stringify(err));
    }      
    else{
      // logger.info("Email success!\n" + emailText + "\n");
      // logger.info(JSON.stringify(info));
      logger.info("Email success!\n"+JSON.stringify(info));
    }
  });
}


function generateRandomPassword(passLength) {
  //generate base password
  var password = generator.generate({
    length: passLength,
    numbers: true
  });
  pass = [];
  for (i = 0; i < password.length; i++) {
    pass[i] = password.charAt(i);
  }

  var alphas = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var nums = '0123456789';
  // set the beginning and end elements to alphas
  pass[0] = alphas.charAt(getRnd(0, alphas.length));
  pass[pass.length - 1] = alphas.charAt(getRnd(0, alphas.length));

  // set one of the ends to a digit
  var flipper = getRnd(0, 2);
  if (flipper == 0) {
    pass[0] = nums.charAt(getRnd(0, nums.length));
  }
  else {
    pass[pass.length - 1] = nums.charAt(getRnd(0, nums.length));
  }

  // change one of the middle characters to a dash
  pass[getRnd(1, pass.length - 2)] = '-'

  // compile array as string
  var result = '';
  for (i = 0; i < pass.length; i++) {
    result += pass[i];
  }

  function getRnd(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
  }

  return result;
}