var config = require("./config"),
  coax = require("coax");

function refreshSync(rep, cb) {
  var cancel = JSON.parse(JSON.stringify(rep));
  cancel.cancel = true;
  coax.post([config.dbHost, "_replicate"], cancel, function(err) {
    if (err) {
      console.log(["nothing to cancel", err])
    }
    coax.post([config.dbHost, "_replicate"], rep, cb)
  })
}

var pullRep = {
    source : {url : config.syncTarget},
    target : config.dbName
    , continuous : true
  },
  pushRep = {
    target : {url: config.syncTarget},
    source : config.dbName
    , continuous : true
  };

// takes care of triggering pull and push replication to the cloud.
// also handles getting a persona assertion if there is an authentication error.
// is a sync is running it will cancel it and retrigger transparently.
function triggerSync(cb, retries) {
  if (retries === 0) return cb("too many retries");
  retries = retries || 3;
  console.log(["triggering sync", pullRep]);
  refreshSync(pushRep, function(err, ok) {
    console.log(["pushRep", err, ok])
    // should use some setInterval with repeater until success or timeout...
    // or a sync replication API
    setTimeout(function(){
      config.dbServer.get("_active_tasks", function(err, tasks){
        if (tasks.length == 0) {
          return cb('replication not running');
        }
        var needsLogin = true;
        for (var i = 0; i < tasks.length; i++) {
          if (!tasks[i].error || tasks[i].error[0] != 401) {
            needsLogin = false;
          }
        };
        console.log(["_active_tasks", tasks]);
        if (needsLogin) {
          window.presentPersonaDialog(config.syncOrigin, function(err, assertion){
            if (err) throw (err);
            // we are logged in!
            // todo we should make sure the email address is the same as our content belongs to
            var postbody = {assertion:assertion};
            config.dbServer.post("_persona_assertion", postbody, function(err, info) {
              if (err) throw(err);
              if (info.email) {
                config.db.get("_local/user", function(err, user) {
                  if (err && err.error == "not_found") {
                    config.db.post({_id : "_local/user", email:info.email}, function(err, ok){
                      if (err) throw(err);
                      // happiness
                      pullRep.source.auth = {persona:{email:info.email}};
                      pushRep.target.auth = {persona:{email:info.email}};
                      console.log(["retry with email", info.email]);
                      triggerSync(cb, retries-1);
                    });
                  } else {
                    if (user.email !== info.email) {
                      cb("this device is already synced for "+user.email);
                    } else {
                      // happiness is copy/paste :)
                      pullRep.source.auth = {persona:{email:info.email}};
                      pushRep.target.auth = {persona:{email:info.email}};
                      console.log(["retry with email", info.email]);
                      triggerSync(cb, retries-1);
                    }
                  }
                });
              }
            });
          });
        // if 403 we don't have any channels yet...
        } else {
          // we are replicating, we must have a session
          refreshSync(pullRep, function(err, ok) {
            config.db("_local/user", cb);
          });
        }
      });
    },500)
  });
};

exports.trigger = triggerSync;
