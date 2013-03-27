var config = require("./config"),
  db = config.db,
  messagesView = db(["_design","threads","_view","messages"]),
  jsonform = require("./jsonform");


function makeNewPhotoClick(user) {
    return function(e) {
      e.preventDefault();
      if (!(navigator.camera && navigator.camera.getPicture)) {
        console.error("no navigator.camera.getPicture")
      } else {
        var link = this, form = $(link).parent("form"),
          doc = messageFromForm(user.user, form);
        if (!doc._rev) delete doc._rev;
        if (!doc._id) delete doc._id;
        console.log("doc!", doc)
        db.post(doc, function(err, ok) {
          navigator.camera.getPicture(function(picData){
            doc._id = ok.id;
            doc._rev = ok.rev;
            doc._attachments = {
              "photo.jpg" : {
                content_type : "image/jpg",
                data : picData
              }
            };
            console.log("save photo", doc._id)
            db.put(doc._id, doc, function(err, ok){
              if (err) {return console.log("save err",err);}
              console.log("pic",ok)
              var input = $("form.message [name=text]");
              if (input.val() == doc.text) {
                input.val('');
              }
            });
          }, function(err){console.error("camera err",err)}, {
            quality : 25,
            targetWidth : 1024,
            targetHeight : 1024,
            destinationType: Camera.DestinationType.DATA_URL
          });
        });
      }
    }
};






exports.create = function(params) {
  console.log("new thread", this, params)
  var elem = $(this);

  auth.getUser(function(err, user) {
    if (err) {
      location.hash = "/reload";
      return;
    };
    elem.html(config.t.newThread(user));
    elem.find("form").submit(function(e) {
      e.preventDefault();
      var doc = jsonform(this);
      doc.owner_id = user.user; // todo rename
      doc.created_at = doc.updated_at = new Date();
      doc._id = doc.thread_id = Math.random().toString(20).slice(2);
      doc.type = "thread";
      db.post(doc, function(err, ok) {
        console.log(err, ok);
        location.hash = "/thread/"+ok.id;
      });
      return false;
    });
  });
};
