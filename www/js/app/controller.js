var config = require('./config'),
  db = config.db,
  messagesView = db(["_design","threads","_view","messages"]),
  async = require("async"),
  jsonform = require("./jsonform");


exports["/"] = function () {
  // render index content html
  var elem = $(this);
  window.changesPainter = function() {
    exports["/"].apply(elem);
  };
  console.log(["init changesPainter", window.changesPainter.toString()]);
  messagesView({group_level : 1}, function(err, view) {
    console.log(['sort these', view.rows]);
    var rows = view.rows.sort(function(a, b){ return new Date(b.value[0]) - new Date(a.value[0])});
    async.map(rows, function(row, cb) {
      config.db.get(row.key[0], function(err, doc){
        row.doc = doc;
        cb(err, row);
      });
    }, function(err, results){
      elem.html(config.t.index({user: config.email, rows : results}))
    });
  });
};

exports["/rooms/new"] = function () {
  // body...
  console.log("new room!")
}

exports["/rooms/:id"] = function(params) {
  var elem = $(this);
  db.get(params.id, function(err, room) {
    if(err){return location.hash="/error";}
    elem.html(config.t.room(room));
    elem.find("form").submit(makeNewMessageSubmit(config.email));
    elem.find("a.photo").click(makeNewPhotoClick(config.email));
    window.changesPainter = function(){
      listMessages(elem.find(".messages"), params.id);
    };
    window.changesPainter();
  });
};

function listMessages (elem, room_id) {
  messagesView([{descending:true, reduce: false, limit:50,
      startkey : [room_id,{}], endkey : [room_id]}], function(err, view) {
    if(err){return console.log(["listMessages err", err])}
    // console.log(view)
    var row, rows = view.rows;
    for (var i = 0; i < rows.length; i++) {
      row = rows[i];
      if (row.value[0] == config.email) {
        row.who = "mine";
      }
      if (row.value[2]) {
        row.photo = db([row.id, "picture"]).pax.toString();
      }
    };
    elem.html(config.t.listMessages(view));
  });
}

function messageFromForm(author, form) {
  var doc = jsonform(form);
  doc.author = author;
  doc.created_at = doc.updated_at = new Date();
  // doc.seq = last_seq++;
  doc.type = "chat";
  return doc;
};

function makeNewMessageSubmit(email) {
  return function(e) {
    e.preventDefault();
    var form = this, doc = messageFromForm(email, form);
    db.post(doc, function(err, ok){
      if (err) {
        return console.log(["form error",err]);
      }
      // clear the form unless they started typing something new already
      var input = $(form).find("[name=markdown]");
      if (input.val() == doc.markdown) {
        input.val('');
      }
    });
  }
}

function makeNewPhotoClick(email) {
    return function(e) {
      e.preventDefault();
      if (!(navigator.camera && navigator.camera.getPicture)) {
        console.error("no navigator.camera.getPicture")
      } else {
        var link = this, form = $(link).parent("form"),
          doc = messageFromForm(email, form);
        navigator.camera.getPicture(function(picData){
          doc._attachments = {
            "picture" : {
              content_type : "image/jpg",
              data : picData
            }
          };
          db.post(doc, function(err, ok){
            if (err) {return console.log("save err",err);}
            var input = $("form.message [name=markdown]");
            if (input.val() == doc.markdown) {
              input.val('');
            }
          });
        }, function(err){
          console.error(["camera err",err]);
          $(link).text("Error");
        }, {
          quality : 25,
          targetWidth : 1024,
          targetHeight : 1024,
          destinationType: Camera.DestinationType.DATA_URL
        });
      }
    }
};
