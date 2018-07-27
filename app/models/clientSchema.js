var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var clientSchema = new Schema({
    _id : String,
    clientId: String,
    name: String,
    dbname: String,
    fullDbUrl:String,
    state : String,
    isActive: { type : Boolean, default: true },
    clientStartDate: { type : Date, default: Date.now },
    services :
        {
            cbt : String,
            proctor :String,
            score    :  String,
            incite    : String,
            inciteClient  :String
        },
    jaspersoftSettings:{
        password: String,
        server: String,
        userName: String
    },
    currentSchoolYear: String,
    schoolYears: [
        {
            year: String,
            active: Boolean
        }
    ]
}, { collection: 'clients' });
module.exports = clientSchema;