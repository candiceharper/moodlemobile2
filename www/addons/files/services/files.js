// (C) Copyright 2015 Martin Dougiamas
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

angular.module('mm.addons.files')

.factory('$mmaFiles', function($mmSite, $mmUtil, $mmFS, $mmWS, $q, $timeout, $log, md5) {

    $log = $log.getInstance('$mmaFiles');

    var self = {},
        defaultParams = {
            "contextid": 0,
            "component": "",
            "filearea": "",
            "itemid": 0,
            "filepath": "",
            "filename": ""
        };

    /**
     * Check if core_files_get_files WS call is available.
     *
     * @return {Boolean} True if WS is available, false otherwise.
     */
    self.canAccessFiles = function() {
        return $mmSite.wsAvailable('core_files_get_files');
    };

    /**
     * Get a file.
     *
     * @module mm.addons.files
     * @ngdoc method
     * @name $mmaFiles#getFile
     * @param  {Object} A file object typically returned from $mmaFiles#getFiles()
     * @return {FileEntry}
     */
    self.getFile = function(file) {
        var deferred = $q.defer(),
            downloadURL = $mmSite.fixPluginfileURL(file.url),
            siteId = $mmSite.getId(),
            linkId = file.linkId,
            filename = $mmFS.normalizeFileName(file.filename),
            directory = siteId + "/files/" + linkId,
            filePath = directory + "/" + filename;

        $log.debug("Starting download of Moodle file: " + downloadURL);
        $mmFS.createDir(directory).then(function() {
            $log.debug("Downloading Moodle file to " + filePath + " from URL: " + downloadURL);

            $mmWS.downloadFile(downloadURL, filePath).then(function(fileEntry) {
                $log.debug("Download of content finished " + fileEntry.toURL() + " URL: " + downloadURL);

                // TODO Caching.
                // var uniqueId = siteId + "-" + hex_md5(url);
                // var file = {
                //     id: uniqueId,
                //     url: url,
                //     site: siteId,
                //     localpath: fullpath
                // };
                // MM.db.insert("files", file);
                deferred.resolve(fileEntry);
            }, function() {
                $log.error('Error downloading from URL: ' + downloadURL);
                deferred.reject();
            });
        }, function() {
            $log.error('Error while creating the directory ' + directory);
            deferred.reject();
        });

        return deferred.promise;
    };

    /**
     * Get the list of files.
     *
     * @module mm.addons.files
     * @ngdoc method
     * @name $mmaFiles#getFiles
     * @param  {Object} params A list of parameters accepted by the Web service.
     * @return {Object}        An object containing the files in the key 'entries', and 'count'.
     *                         Additional properties is added to the entries, such as:
     *                          - imgpath: The path to the icon.
     *                          - link: The JSON string of params to get to the file.
     *                          - linkId: A hash of the file parameters.
     */
    self.getFiles = function(params) {
        var deferred = $q.defer(),
            options = {};

        options.cacheKey = getFilesListCacheKey(params);

        $mmSite.read('core_files_get_files', params, options).then(function(result) {
            var data = {
                entries: [],
                count: 0
            };

            if (typeof result.files == 'undefined') {
                deferred.reject();
                return;
            }

            angular.forEach(result.files, function(entry) {
                entry.link = {};
                entry.link.contextid = (entry.contextid) ? entry.contextid : "";
                entry.link.component = (entry.component) ? entry.component : "";
                entry.link.filearea = (entry.filearea) ? entry.filearea : "";
                entry.link.itemid = (entry.itemid) ? entry.itemid : 0;
                entry.link.filepath = (entry.filepath) ? entry.filepath : "";
                entry.link.filename = (entry.filename) ? entry.filename : "";

                if (entry.component && entry.isdir) {
                    // Delete unused elements that may break the request.
                    entry.link.filename = "";
                }

                if (entry.isdir) {
                    entry.imgpath = $mmUtil.getFolderIcon();
                } else {
                    entry.imgpath = $mmUtil.getFileIcon(entry.filename);
                }

                entry.link = JSON.stringify(entry.link);
                entry.linkId = md5.createHash(entry.link);
                // entry.localpath = "";

                // if (!entry.isdir && entry.url) {
                //     // TODO Check $mmSite.
                //     var uniqueId = $mmSite.id + "-" + md5.createHash(entry.url);
                //     var path = MM.db.get("files", uniqueId);
                //     if (path) {
                //         entry.localpath = path.get("localpath");
                //     }
                // }

                data.count += 1;
                data.entries.push(entry);
            });

            deferred.resolve(data);
        }, function() {
            deferred.reject();
        });

        return deferred.promise;
    };

    /**
     * Get cache key for file list WS calls.
     *
     * @param  {Object} params Params of the directory to get.
     * @return {String}        Cache key.
     */
    function getFilesListCacheKey(params) {
        var root = params.component === '' ? 'site' : 'my';
        return 'mmaFiles:list:' + root + ':' + params.contextid + ':' + params.filepath;
    }

    /**
     * Get the private files of the current user.
     *
     * @module mm.addons.files
     * @ngdoc method
     * @name $mmaFiles#getMyFiles
     * @return {Object} See $mmaFiles#getFiles
     */
    self.getMyFiles = function() {
        var params = getMyFilesRootParams();
        return self.getFiles(params);
    };

    /**
     * Get the common part of the cache keys for private files WS calls.
     *
     * @return {String} Cache key.
     */
    function getMyFilesListCommonCacheKey() {
        return 'mmaFiles:list:my';
    }

    /**
     * Get params to get root private files directory.
     *
     * @return {Object} Params.
     */
    function getMyFilesRootParams() {
        var params = angular.copy(defaultParams, {});
        params.component = "user";
        params.filearea = "private";
        params.contextid = -1;
        params.contextlevel = "user";
        params.instanceid = $mmSite.getInfo().userid;
        return params;
    }

    /**
     * Get the site files.
     *
     * @module mm.addons.files
     * @ngdoc method
     * @name $mmaFiles#getSiteFiles
     * @return {Object} See $mmaFiles#getFiles
     */
    self.getSiteFiles = function() {
        var params = angular.copy(defaultParams, {});
        return self.getFiles(params);
    };

    /**
     * Get the common part of the cache keys for site files WS calls.
     *
     * @return {String} Cache key.
     */
    function getSiteFilesListCommonCacheKey() {
        return 'mmaFiles:list:site';
    }

    /**
     * Invalidates list of files in a certain directory.
     *
     * @module mm.addons.files
     * @ngdoc method
     * @name $mmaFiles#invalidateDirectory
     * @param  {String} root Root of the directory ('my' for private files, 'site' for site files).
     * @param  {String} path Path to the directory.
     * @return {Promise}     Promise resolved when the list is invalidated.
     */
    self.invalidateDirectory = function(root, path) {
        var params = {};
        if (!path) {
            if (root === 'site') {
                params = angular.copy(defaultParams, {});
            } else if (root === 'my') {
                params = getMyFilesRootParams();
            }
        } else {
            params = JSON.parse(path);
        }

        return $mmSite.invalidateWsCacheForKey(getFilesListCacheKey(params));
    };

    /**
     * Invalidates list of private files.
     *
     * @module mm.addons.files
     * @ngdoc method
     * @name $mmaFiles#invalidateMyFiles
     * @return {Promise} Promise resolved when the list is invalidated.
     */
    self.invalidateMyFiles = function() {
        return $mmSite.invalidateWsCacheForKeyStartingWith(getMyFilesListCommonCacheKey());
    };

    /**
     * Invalidates list of site files.
     *
     * @module mm.addons.files
     * @ngdoc method
     * @name $mmaFiles#invalidateSiteFiles
     * @return {Promise} Promise resolved when the list is invalidated.
     */
    self.invalidateSiteFiles = function() {
        return $mmSite.invalidateWsCacheForKeyStartingWith(getSiteFilesListCommonCacheKey());
    };

    /**
     * Return whether or not the plugin is enabled. Plugin is enabled if:
     *     - Site supports core_files_get_files
     *     or
     *     - User has capability moodle/user:manageownfiles and WS allows uploading files.
     *
     * @module mm.addons.files
     * @ngdoc method
     * @name $mmaFiles#isPluginEnabled
     * @return {Boolean}
     */
    self.isPluginEnabled = function() {
        var canAccessFiles = self.canAccessFiles(),
            canAccessMyFiles = $mmSite.canAccessMyFiles(),
            canUploadFiles = $mmSite.canUploadFiles();

        return canAccessFiles || (canUploadFiles && canAccessMyFiles);
    };

    /**
     * Upload a file.
     *
     * @module mm.addons.files
     * @ngdoc method
     * @name $mmaFiles#uploadFile
     * @param  {Object} uri File URI.
     * @param  {Object} options Options for the upload.
     *                          - {Boolean} deleteAfterUpload Whether or not to delete the original after upload.
     *                          - {String} fileKey
     *                          - {String} fileName
     *                          - {String} mimeType
     * @return {Promise}
     */
    self.uploadFile = function(uri, options) {
        options = options || {};
        var deleteAfterUpload = options.deleteAfterUpload,
            deferred = $q.defer(),
            ftOptions = {
                fileKey: options.fileKey,
                fileName: options.fileName,
                mimeType: options.mimeType
            };

        $mmSite.uploadFile(uri, ftOptions).then(function(result) {
            // Success.
            if (deleteAfterUpload) {
                $timeout(function() {
                    // Use set timeout, otherwise in Node-Webkit the upload threw an error sometimes.
                    $mmFS.removeExternalFile(uri);
                }, 500);
            }
            deferred.resolve(result);
        }, function(error) {
            // Error.
            if (deleteAfterUpload) {
                $timeout(function() {
                    // Use set timeout, otherwise in Node-Webkit the upload threw an error sometimes.
                    $mmFS.removeExternalFile(uri);
                }, 500);
            }
            deferred.reject(error);
        }, function(progress) {
            // Progress.
            deferred.notify(progress);
        });

        return deferred.promise;
    };

    /**
     * Upload image.
     * @todo Handle Node Webkit.
     *
     * @module mm.addons.files
     * @ngdoc method
     * @name $mmaFiles#uploadImage
     * @param  {String}  uri         File URI.
     * @param  {Boolean} isFromAlbum True if the image was taken from album, false if it's a new image taken with camera.
     * @return {Promise}
     */
    self.uploadImage = function(uri, isFromAlbum) {
        $log.debug('Uploading an image');
        var d = new Date(),
            options = {};

        if (typeof(uri) === 'undefined' || uri === ''){
            // In Node-Webkit, if you successfully upload a picture and then you open the file picker again
            // and cancel, this function is called with an empty uri. Let's filter it.
            $log.debug('Received invalid URI in $mmaFiles.uploadImage()');
            return $q.reject();
        }

        options.deleteAfterUpload = !isFromAlbum;
        options.fileKey = "file";
        options.fileName = "image_" + d.getTime() + ".jpg";
        options.mimeType = "image/jpeg";

        return self.uploadFile(uri, options);
    };

    /**
     * Upload media.
     *
     * @module mm.addons.files
     * @ngdoc method
     * @name $mmaFiles#uploadMedia
     * @param  {Array} mediaFiles Array of file objects.
     * @return {Array} Array of promises.
     */
    self.uploadMedia = function(mediaFiles) {
        $log.debug('Uploading media');
        var promises = [];
        angular.forEach(mediaFiles, function(mediaFile, index) {
            var options = {};
            options.fileKey = null;
            options.fileName = mediaFile.name;
            options.mimeType = null;
            options.deleteAfterUpload = true;
            promises.push(self.uploadFile(mediaFile.fullPath, options));
        });
        return promises;
    };

    /**
     * Upload a file of any type.
     *
     * @module mm.addons.files
     * @ngdoc method
     * @name $mmaFiles#uploadGenericFile
     * @param  {String} uri  File URI.
     * @param  {String} name File name.
     * @param  {String} type File type.
     * @return {Promise}     Promise resolved when the file is uploaded.
     */
    self.uploadGenericFile = function(uri, name, type) {
        var options = {};
        options.fileKey = null;
        options.fileName = name;
        options.mimeType = type;
        options.deleteAfterUpload = true;

        return self.uploadFile(uri, options);
    };

    return self;
});
