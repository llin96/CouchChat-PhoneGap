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

// poll _active_tasks until timeout
// if success cancel poll, cb no error
// if needsLogin cancel poll, cb with error
// if timeout cancel poll, cb with error
function pollForSyncSuccess(timeout, session_id, cb) {
  var done = false, lastTask, poller = setInterval(function(){
    config.dbServer.get("_active_tasks", function(err, tasks){
      if (err) return; // try again

      var needsLogin = true, offline = true;
      for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].task == session_id) {
          lastTask = tasks[i];
        }
      };
      console.log(["_active_tasks", lastTask]);
      if (lastTask.status == "Idle" || lastTask.status == "Stopped") {
        // todo maybe we are cool with tasks that have Processed > 0 changes
        offline = false;
      }
      if (!lastTask.error || lastTask.error[0] != 401) {
        needsLogin = false;
      }
      if (!offline) {
        clearInterval(poller);
        done = true;
        if (needsLogin) {
          cb("needsLogin", lastTask);
        } else {
          cb(false, lastTask);
        }
      }
    })
  }, 250);
  setTimeout(function() {
    clearInterval(poller);
    if (!done) {
      cb("timeout", lastTask);
    }
  }, timeout);
}

function loginWithPersona(cb) {
  window.presentPersonaDialog(config.syncOrigin, function(err, assertion){
    if (err) return cb(err);
    config.dbServer.post("_persona_assertion", {assertion:assertion}, cb);
  })
}


function setupLocalUser(info, cb) {
  config.db.get("_local/user", function(err, user) {
    if (err && err.error == "not_found") {
      config.db.post({_id : "_local/user", email:info.email}, function(err, ok){
        cb(err, info);
      });
    } else {
      if (user.email !== info.email) {
        cb("this device is already synced for "+user.email);
      } else {
        cb(false, user);
      }
    }
  });
};

// takes care of triggering pull and push replication to the cloud.
// also handles getting a persona assertion if there is an authentication error.
// is a sync is running it will cancel it and retrigger transparently.
function triggerSync(cb, retries) {
  if (retries === 0) return cb("too many retries");
  retries = retries || 3;
  console.log(["triggering sync", retries, pullRep]);
  refreshSync(pushRep, function(err, ok) {
    console.log(["pushRep", err, ok.session_id])
    pollForSyncSuccess(5000, ok.session_id, function(err, status){
      if (err == "needsLogin") {
        loginWithPersona(function(err, info){
          if (err) return cb(err);
          console.log(["personaInfo", info])
          setupLocalUser(info, function(err, user){
            if (err) return cb(err);
            pullRep.source.auth = {persona:{email:user.email}};
            pushRep.target.auth = {persona:{email:user.email}};
            console.log(["retry with email", user.email]);
            triggerSync(cb, retries-1);
          });
        });
      } else if (err) {
        cb(err);
      } else {
        // we are connected, set up pull replication
        refreshSync(pullRep, function(err, ok) {
          config.db("_local/user", cb);
        });
      }
    });
  });
};

exports.trigger = triggerSync;
