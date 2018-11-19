var aws = require('aws-sdk');
var nodemailer = require('nodemailer');
var hbs = require('nodemailer-express-handlebars');
var path = require('path');
var handlebars = require('express-handlebars');
var ses = new aws.SES();
var s3 = new aws.S3();
const docClient = new aws.DynamoDB.DocumentClient();

function getS3File(bucket, key) {
  return new Promise(function (resolve, reject) {
    s3.getObject(
      {
        Bucket: bucket,
        Key: key
      },
      function (err, data) {
        if (err) return reject(err);
        else return resolve(data);
      }
    );
  });
}


module.exports.saveNotification = function (event, context, callback) {
  const message = event.Records[0].Sns.Message;
  const messageJson = JSON.parse(event.Records[0].Sns.Message);
  var params={
    Item:{
      messageId: messageJson.mail.messageId,
      destination: messageJson.mail.destination[0],
      message: message
    },
    TableName: process.env.messageFailureTableName
  };
  docClient.put(params, function(err, data){
    if(err){
      callback(err, null);
    }else{
      callback(null, data);
    }
  });
};

module.exports.sendEmail = function (event, context, callback) {
  const records = event.Records;
  const insertEvents = records.filter(r => r.eventName === "INSERT");
  var viewEngine = handlebars.create({});
  var options = {
    viewEngine: viewEngine,
    viewPath: path.resolve(__dirname, '../views')
  };

  for (let i = 0; i < insertEvents.length; i++) {
    var record = insertEvents[i];
    var data = JSON.parse(record.dynamodb.NewImage.data.S);
    var templateName = record.dynamodb.NewImage.subject.S.includes("Credit") ? "creditcard-payment" : "ach-payment";

    if(data.attachmentName != null){
      getS3File(process.env.emailAttachmentsBucketName, data.confirmationNumber + '.pdf')
      .then(function (fileData) {

        var mailOptions = {
          from: record.dynamodb.NewImage.from.S,
          subject: record.dynamodb.NewImage.subject.S,
          to: record.dynamodb.NewImage.to.S,
          template: templateName,
          context: {
            customerEmail: data.customerEmail,
            paymentType: data.paymentType,
            paymentDate: data.paymentDate,
            paymentAmount: data.paymentAmount,
            dpuTransactionId: data.dpuTransactionId,
            confirmationNumber: data.confirmationNumber,
            bankAccountNumber: data.bankAccountNumber,
            billingAccountNumber: data.billingAccountNumber,
            supportPhoneNumber: data.supportPhoneNumber,
            supportEmail: data.supportEmail,
            paymentDetails: data.paymentDetails,
            selectedPaymentMethod: data.selectedPaymentMethod
          },

          attachments: [
            {
              filename: data.attachmentName,
              content: fileData.Body
            }
          ]
        };

        var transporter = nodemailer.createTransport({
          SES: ses
        });
        transporter.use('compile', hbs(options));

        transporter.sendMail(mailOptions, function (err, info) {
          if (err) {
            console.log(err);
            console.log('Error sending email');
            callback(err);
          } else {
            console.log('Email sent successfully');
            var emailData = info.raw.toString('utf8');
            var parameters = {
              Body: emailData,
              Bucket: process.env.emailHistoryBucketName,
              Key: info.response + ".txt"
            };
            s3.putObject(parameters, function(err, data) {
              if (err) console.log(err, err.stack); // an error occurred
              else     console.log(data);           // successful response
            });
            callback();
          }
        });

      })
      .catch(function (error) {
        console.log(error);
        console.log('Error getting attachment from S3');
        callback(error);
      });
    }else{
        var mailOptions = {
          from: record.dynamodb.NewImage.from.S,
          subject: record.dynamodb.NewImage.subject.S,
          to: record.dynamodb.NewImage.to.S,
          template: templateName,
          context: {
            customerEmail: data.customerEmail,
            paymentType: data.paymentType,
            paymentDate: data.paymentDate,
            paymentAmount: data.paymentAmount,
            dpuTransactionId: data.dpuTransactionId,
            confirmationNumber: data.confirmationNumber,
            bankAccountNumber: data.bankAccountNumber,
            billingAccountNumber: data.billingAccountNumber,
            supportPhoneNumber: data.supportPhoneNumber,
            supportEmail: data.supportEmail,
            paymentDetails: data.paymentDetails,
            selectedPaymentMethod: data.selectedPaymentMethod
          }
        };

        var transporter = nodemailer.createTransport({
          SES: ses
        });
        transporter.use('compile', hbs(options));

        transporter.sendMail(mailOptions, function (err, info) {
          if (err) {
            console.log(err);
            console.log('Error sending email');
            callback(err);
          } else {
            console.log('Email sent successfully');
            var emailData = info.raw.toString('utf8');
            var parameters = {
              Body: emailData,
              Bucket: process.env.emailHistoryBucketName,
              Key: info.response + ".txt"
            };
            s3.putObject(parameters, function(err, data) {
              if (err) console.log(err, err.stack); // an error occurred
              else     console.log(data);           // successful response
            });
            callback();
          }
        });
    }
  }

};
