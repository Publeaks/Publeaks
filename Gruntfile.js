module.exports = function(grunt) {
  'use strict';
  //
  // Grunt configuration:
  //
  grunt.initConfig({
    manifest:{
      dest: 'tmp/'
    },

    watch: {
      files: [
        'skel/css/*',
        'skel/fonts/*',
        'skel/js/*',
        'skel/img/*',
        'skel/partials/*',
        'skel/pages/*'
      ],
      tasks: ['build']
    },

    clean: {
      release: ['tmp', 'build']
    },

    copy: {
        release: {
            files: [{
              dest: 'tmp/', cwd: 'skel/', src: ['css/**', 'fonts/**', 'js/**', 'img/**'], expand: true
            }]
        }
    },

    concat: {
      templates_meshup: {
        files: {
          'build/index.html': ['skel/partials/header.html', 'skel/pages/index.html', 'skel/partials/footer.html' ],
          'build/about.html': ['skel/partials/header.html', 'skel/pages/about.html', 'skel/partials/footer.html' ],
          'build/faq.html': ['skel/partials/header.html', 'skel/pages/faq.html', 'skel/partials/footer.html' ],
          'build/contact.html': ['skel/partials/header.html', 'skel/pages/contact.html', 'skel/partials/footer.html' ],
          'build/security.html': ['skel/partials/header.html', 'skel/pages/security.html', 'skel/partials/footer.html' ],
          'build/technology.html': ['skel/partials/header.html', 'skel/pages/technology.html', 'skel/partials/footer.html' ],
          'build/press.html': ['skel/partials/header.html', 'skel/pages/press.html', 'skel/partials/footer.html' ]
        },
      },
    },

    html: {
      files: ['**/*.html']
    }

  });

  require('matchdep').filterDev('grunt-*').forEach(grunt.loadNpmTasks);

  var path = require('path'),
    superagent = require('superagent'),
    fs = require('fs'),
    Gettext = require("node-gettext")

  grunt.registerTask('cleanupWorkingDirectory', function() {

    var rm_rf = function(dir) {
      var s = fs.statSync(dir);

      if (!s.isDirectory()) {return fs.unlinkSync(dir);}

      fs.readdirSync(dir).forEach(function(f) {
        rm_rf(path.join(dir || '', f || ''))
      });

      fs.rmdirSync(dir);
    };

    grunt.file.mkdir('build/');

    grunt.file.recurse('tmp', function(absdir, rootdir, subdir, filename) {
      grunt.file.copy(absdir, path.join('build/', subdir || '', filename || ''));
    });

    rm_rf('tmp');

  });

  function readTransifexrc(){
    var transifexrc = fs.realpathSync(process.env.HOME + '/.transifexrc'),
      err = fs.stat(transifexrc),
      usernameRegexp = /username = (.*)/,
      passwordRegexp = /password = (.*)/,
      content, login = {};

    if (err) {
      console.log(transifexrc + " does not exist");
      console.log("It should contain");
      console.log("username = <your username>");
      console.log("password = <your password>");
      throw 'No transifexrc file';
    }

    content = grunt.file.read(transifexrc);
    login.username = usernameRegexp.exec(content)[1];
    login.password = passwordRegexp.exec(content)[1];
    return login;
  }

  var agent = superagent.agent(),
    baseurl = 'http://www.transifex.com/api/2/project/publeaks',
    sourceFile = 'pot/en.po';

  function fetchTxSource(cb){
    var url = baseurl + '/resource/publeaks/content',
      login = readTransifexrc();

    agent.get(url)
      .auth(login.username, login.password)
      .end(function(err, res){
        var content = JSON.parse(res.text)['content'];
        fs.writeFileSync(sourceFile, content);
        console.log("Written source to " + sourceFile + ".");
        cb();
    });
  }

  function updateTxSource(cb){
    var url = baseurl + '/resource/publeaks/content/',
      content = grunt.file.read(sourceFile),
      login = readTransifexrc();

    agent.put(url)
      .auth(login.username, login.password)
      .set('Content-Type', 'application/json')
      .send({'content': content})
      .end(function(err, res){
        console.log(res.text);
        cb();
    });
  }

  function listLanguages(cb){
    var url = baseurl + '/resource/publeaks/?details',
      login = readTransifexrc();

    agent.get(url)
      .auth(login.username, login.password)
      .end(function(err, res){
        var result = JSON.parse(res.text);
        cb(result);
    });

  }

  function fetchTxTranslationsForLanguage(langCode, cb) {
    var resourceUrl = baseurl + '/resource/publeaks/',
      login = readTransifexrc();

    agent.get(resourceUrl + 'stats/' + langCode + '/')
      .auth(login.username, login.password)
      .end(function(err, res){
        var content = JSON.parse(res.text);

        if (content.translated_entities > content.untranslated_entities) {
          agent.get(resourceUrl + 'translation/' + langCode + '/')
            .auth(login.username, login.password)
            .end(function(err, res){
            var content = JSON.parse(res.text)['content'];
            cb(content);
          });
        } else {
          cb();
        }
      });
  }

  function fetchTxTranslations(cb){
    var fetched_languages = 0,
      total_languages, supported_languages = {};

    listLanguages(function(result){
      result.available_languages = result.available_languages.filter(function( language ) {
        /*
            we skip en_US that is used internaly only as feedback in order
            to keep track of corrections suggestions
        */
        return language.code !== 'en_US';
      });

      total_languages = result.available_languages.length;

      result.available_languages.forEach(function(language){

        var content = grunt.file.read(sourceFile);

        fetchTxTranslationsForLanguage(language.code, function(content){
          if (content) {
            var potFile = "pot/" + language.code + ".po";

            fs.writeFileSync(potFile, content);
            console.log("Fetched " + language.code);
            supported_languages[language.code] = language.name;
          }

          fetched_languages += 1;

          if (total_languages == fetched_languages) {
            var sorted_keys = Object.keys(supported_languages).sort();

            console.log("List of available translations:");

            for (var i in sorted_keys) {
              console.log(" { \"code\": \"" + sorted_keys[i] +
                          "\", \"name\": \"" + supported_languages[sorted_keys[i]] +"\" },");
            }

            cb(supported_languages);
          }
        });

      });
    });
  }

  grunt.registerTask('pushTx', function(){
    var done = this.async();
    updateTxSource(done);
  });

  grunt.registerTask('pullTx', function(){
    var done = this.async();

    fetchTxTranslations(done);
  });

  grunt.registerTask('updateTranslationsSource', function() {
    var done = this.async(),
      gt = new Gettext(),
      strings,
      translations = {},
      translationStringRegexpHTML1 = /"(.+?)"\s+\|\s+translate/gi,
      translationStringRegexpHTML2 = /translate>(.+?)</gi,
      translationStringCount = 0;

    gt.addTextdomain("en");

    function extractPotFromHTMLFile(filepath) {
      var filecontent = grunt.file.read(filepath),
        result;

      while ( (result = translationStringRegexpHTML1.exec(filecontent)) ) {
        gt.setTranslation("en", "", result[1], result[1]);
        translationStringCount += 1;
      }

      while ( (result = translationStringRegexpHTML2.exec(filecontent)) ) {
        gt.setTranslation("en", "", result[1], result[1]);
        translationStringCount += 1;
      }

    };

    grunt.file.recurse('skel/partials', function(absdir, rootdir, subdir, filename) {
      extractPotFromHTMLFile(path.join('skel/partials/', subdir || '', filename || ''));
    });

    grunt.file.recurse('skel/pages', function(absdir, rootdir, subdir, filename) {
      extractPotFromHTMLFile(path.join('skel/pages/', subdir || '', filename || ''));
    });

    grunt.file.mkdir("pot");

    fs.writeFileSync("pot/en.po", gt.compilePO("en"));

    console.log("Written " + translationStringCount + " string to pot/en.po.");

    updateTxSource(done);

  });

  // Run this task to update translation related files
  grunt.registerTask('updateTranslations', ['updateTranslationsSource']);

  // Run this to build your app. You should have run updateTranslations before you do so, if you have changed something in your translations.
  grunt.registerTask('build', ['clean', 'copy', 'concat', 'manifest', 'cleanupWorkingDirectory']);
};
