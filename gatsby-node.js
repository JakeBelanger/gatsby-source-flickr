const { URLSearchParams } = require('url');
const { createRemoteFileNode } = require('gatsby-source-filesystem');
const fetch = require('node-fetch');

exports.sourceNodes = async (
  { actions: { createNode }, createNodeId, createContentDigest, store, cache },
  { plugins, ...options }
) => {
  // const sizes = ['sq', 't', 's', 'q', 'm', 'n', 'z,', 'c', 'l', 'z'];

  // The flickr API has some issues when put into GraphQL - create a suitable version
  const fixPhoto = photo => {
    const fixed = photo;

    // Don't name crash with node.id
    fixed.photo_id = fixed.id;
    delete fixed.id;

    fixed.original_src = photo.url_o;
    delete fixed.url_o;

    fixed.width = parseInt(photo.width_o);
    delete fixed.width_o;
    fixed.height = parseInt(photo.height_o);
    delete fixed.height_o;

    // Some fields can come down as either string or number. GraphQL doesn't like that. Force everything to number

    // sizes.forEach(suffix => {
    //   if (fixed.hasOwnProperty(`height_${suffix}`)) {
    //     fixed[`height_${suffix}`] = parseInt(fixed[`height_${suffix}`]);
    //   }
    //   if (fixed.hasOwnProperty(`width_${suffix}`)) {
    //     fixed[`width_${suffix}`] = parseInt(fixed[`width_${suffix}`]);
    //   }
    // });

    if (fixed.hasOwnProperty('accuracy')) {
      fixed.accuracy = parseInt(fixed.accuracy);
    }

    // A missing latitude or longitude can come down as either 0 or "0" - force to string

    if (fixed.hasOwnProperty('latitude')) {
      fixed.latitude = '' + fixed.latitude;
    }
    if (fixed.hasOwnProperty('longitude')) {
      fixed.longitude = '' + fixed.longitude;
    }

    // These can come down as either string or number. Have only ever seen "0" and 0 here - and documentation is sparse - remove them

    if (fixed.hasOwnProperty('datetakengranularity')) {
      delete fixed.datetakengranularity;
    }
    if (fixed.hasOwnProperty('datetakenunknown')) {
      delete fixed.datetakenunknown;
    }

    // Convert Date versions of dateupload and lastupdate

    if (fixed.hasOwnProperty('dateupload')) {
      fixed.dateupload = new Date(fixed.dateupload * 1000);
    }
    if (fixed.hasOwnProperty('lastupdate')) {
      fixed.lastupdate = new Date(fixed.lastupdate * 1000);
    }

    // Simplify the structure of the description to just a string

    if (fixed.hasOwnProperty('description')) {
      if (fixed.description.hasOwnProperty('_content')) {
        fixed.description = fixed.description._content;
      }
    }

    return fixed;
  };

  const unwrap = data => {
    if (data.hasOwnProperty('photoset')) {
      return data.photoset;
    }

    return data.photos;
  };

  const callFlickr = async options => {
    const params = new URLSearchParams(options);
    const url = `https://api.flickr.com/services/rest/?${params.toString()}`;

    const response = await fetch(url);
    const data = await response.json();

    const photos = unwrap(data);

    if (!photos) throw JSON.stringify(data);

    // @TODO: gather all the async tasks
    photos.photo.forEach(async raw => {
      const photo = fixPhoto(raw);
      const nodeId = createNodeId(`flickr-photo-${photo.photo_id}`);

      const fileNode = await createRemoteFileNode({
        url: photo.original_src, // string that points to the URL of the image\
        createNode, // helper function in gatsby-node to generate the node
        createNodeId, // helper function in gatsby-node to generate the node id
        cache, // Gatsby's cache
        store, // Gatsby's Redux store
      });

      createNode({
        ...photo,
        localFile: fileNode.id,
        id: nodeId,
        parent: null,
        children: [],
        internal: {
          type: 'FlickrPhoto',
          content: JSON.stringify(photo),
          contentDigest: createContentDigest(photo),
        },
      });
    });

    if (photos.page < photos.pages)
      await callFlickr({
        ...options,
        page: photos.page + 1,
      });
  };

  await callFlickr({
    method: 'flickr.photos.search',
    extras:
      'description, license, date_upload, date_taken, owner_name, original_format, last_update, geo, tags, machine_tags, views, media, url_o',
    per_page: 500,
    page: 1,
    format: 'json',
    nojsoncallback: 1,
    ...options,
  });
};

exports.createSchemaCustomization = ({ actions }) => {
  const { createTypes } = actions;

  createTypes(`
    type FlickrPhoto implements Node {
      localFile: File @link
      id: String
      secret: String
      server: String

      title: String
      description: String
      original_src: String
      width: Int
      height: Int
      originalformat: String

      owner_name: String
      media: String
      views: Int
      tags: String 
      machine_tags: String
      license: String

      dateupload: Date
      datetaken: Date
      lastupdate: Date
    }
  `);
};
