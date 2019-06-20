var database_connector = require('database_connector');
var s3_service = require('s3_service');
var AWS = require('aws-sdk');
var config = require('../../config.json');
//resources
var s3 = new AWS.S3();
const BUCKET = 'web2youfileshareexampledocuploads';


exports.getDocuments = function(user) {
    var myDocuments = database_connector.getDocuments(user['email']);
    var sharedDocuments = database_connector.getDocumentsSharedWithUser(user["email"] + '#' + user["name"] + '#' + user["surname"]);
    var viewData = [];

    //transform the database results
    if(typeof myDocuments !== 'undefined'){
        for (var sharedFile in myDocuments){
            var shares = (sharedFile["people"]) ? sharedFile["people"] : [];
            var people = [];
            var sharedWithYou = false;

            for (var u in shares){
                var attrs = u.split('#');
                people.push(['"name":'+ attrs[1], '"surname":'+ attrs[2], '"email":'+ attrs[0]]);
                sharedWithYou = (user["email"] == u.split("#")[0]) ? true : false;
            }

            viewData.push(
                [
                    '"share_id":'+ sharedFile["share_id"],
                    '"uploaded_at":'+ sharedFile["uploaded_at"],
                    '"expires_at":'+ sharedFile["expires_at"],
                    '"display_name":'+ sharedFile["display_name"],
                    '"size":'+ sharedFile["size"],
                    '"owner":'+ [
                        '"name":'+ sharedFile["owner_name"],
                        '"surname":'+ sharedFile["owner_surname"],
                        '"email":'+ sharedFile["owner"]
                    ],
                    '"shared_with_others":'+ (sharedFile["people"]) ? true : false,
                    '"share_with_you":'+ sharedWithYou,
                    '"people":'+ people
                ]
            );
        }
    }

    if (typeof sharedDocuments !== 'undefined'){
        for (sharedFile in sharedDocuments){
            var shares = (sharedFile["people"]) ? sharedFile["people"] : [];
            var people = [];
            var sharedWithYou = false;

            for ( u in shares){
                attrs = u.split('#');
                people.push(['"name":'+ attrs[1], '"surname":'+ attrs[2], '"email":'+ attrs[0]]);
                sharedWithYou = (user["email"] == u.split("#")[0]) ? true : false;
            }

            viewData.push(
                [
                    '"share_id":'+ sharedFile["share_id"],
                    '"uploaded_at":'+ sharedFile["uploaded_at"],
                    '"expires_at":'+ sharedFile["expires_at"],
                    '"display_name":'+ sharedFile["display_name"],
                    '"size":'+ sharedFile["size"],
                    '"owner":'+ [
                        '"name":'+ sharedFile["owner_name"],
                        '"surname":'+ sharedFile["owner_surname"],
                        '"email":'+ sharedFile["owner"]
                    ],
                    '"shared_with_others":'+ (sharedFile["people"]) ? true : false,
                    '"share_with_you":'+ sharedWithYou,
                    '"people":'+ people
                ]
            );
        }            
    }
    return JSON.stringify(viewData);
};

exports.deleteDocument = function(user, shareId){
    var doc = database_connector.getDocument(user, shareId);

    if (typeof doc !== 'undefined'){
        if (s3_service.deleteDocument("s3_key")){ //make sure you don't orphan the dynamodb record
            database_connector.insertAuditLog(user, shareId, doc["s3_key"], doc["display_name"], "deleted");
            return database_connector.delete_document(user, shareId);
        } else {
            return false;
        }
    } else {
        return false;
    }
};

exports.getDownloadLink = function(user, shareId){
    var doc = database_connector.getFileByShareId(shareId);
    var people = doc.people;
    var isSharedWithMe = false;

    if (typeof people !== 'undefined'){
        isSharedWithMe = (user["email"] == people.email) ? true : false;
    }

    if (typeof doc !== 'undefined' && doc.owner == user["email"] || isSharedWithMe){
        var url = s3.getSignedUrl('getObject', {
            'Bucket': config.S3_UPLOADS_BUCKET_NAME,
            'Key': doc["s3_key"],
            "ResponseContentDisposition": "attachment; filename="+ doc["display_name"]
        });

        database_connector.insertAuditLog(user, shareId, doc["s3_key"], doc["display_name"], "downloaded");

        return url;
    } else {
        return {"Message": "Error, not authorized"};
    }
};

exports.shareDocument = function(user, shareId, users){
    var doc = database_connector.getDocument(user, shareId);

    if (typeof doc !== 'undefined'){
        database_connector.insertAuditLog(user, shareId, doc["s3_key"],
                                    doc["display_name"], "shared with " + users);
        return database_connector.shareDocument(user["email"], shareId, users);
    }

    return false;
};

exports.renameDocument = function(user, shareId, displayName){
    var doc = database_connector.getDocument(user, shareId);

    if (typeof doc !== 'undefined'){
        database_connector.insertAuditLog(user, shareId, doc["s3_key"],
                                    doc["display_name"], "renamed to " + displayName);
        return database_connector.renameDocument(user["email"], shareId, displayName);
    }

    return false;
};

exports.expireOldDocuments = function(){
    var documents = database_connector.scanDocuments();
    var now = Date.now();

    for(var doc in documents){
        var expireDate = doc["expires_at"];

        if (expireDate < now){
            if (s3_service.deleteDocument(doc["s3_key"])){
                database_connector.insertAuditLog({"email": "N/A", "name": "System", "surname": "Daemon"}, doc["share_id"], doc["s3_key"], doc["display_name"], "automatically deleted because expired");
                database_connector.delete_document({"email": doc["owner"], "name": doc["owner_name"], "surname": doc["owner_surname"]}, doc["share_id"]);
            }
        }
    }
};