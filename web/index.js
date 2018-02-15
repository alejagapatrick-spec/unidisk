/* global UnidiskHelper */

function utf8Uint8ArrayToString(uintArray) {
  var encodedString = String.fromCharCode.apply(null, uintArray),
    decodedString = decodeURIComponent(escape(encodedString));
  return decodedString;
}

function utf16Uint8ArrayToString(uintArray) {
  return String.fromCharCode.apply(null, new Uint16Array(uintArray.buffer));
}

let verifyPattern = {
  'Dropbox_dummy.txt': {
    module: 'Dropbox',
    profile: {
      cacheStore: 'memory',
      token: 'EXAMPLE_TOKEN'
    },
    path: '/dir1/dir2/dummy.txt',
    offset: 1,
    size: 6,
    string: 'ummy\n',
    stringConvertion: utf8Uint8ArrayToString
  },
  'Sample_dummy.txt': {
    module: 'Sample',
    profile: {
      cacheStore: 'memory',
      JSONPath: './test_fixture.json'
    },
    path: '/dir1/dir2/dummy.txt',
    offset: 0,
    size: 12,
    string: 'Dummy\n',
    stringConvertion: utf16Uint8ArrayToString
  }
};

const RESULT_NODE = document.getElementById('result');
function ok(test, msg) {
  let p = document.createElement('p');
  p.textContent = msg;
  p.classList.add(test ? 'pass' : 'error');
  RESULT_NODE.appendChild(p);
}

function verify(pattern) {
  return new Promise(resolve => {
    const path = pattern.path;
    const udm = UnidiskHelper.create(pattern.module, pattern.profile);
    const EXPECTED_SIZE = pattern.size;
    const EXPECTED_STRING = pattern.string;
    const array = new Uint8Array(EXPECTED_SIZE - pattern.offset);

    udm.downloadFileInRangeByCache(path, array, pattern.offset, EXPECTED_SIZE, function () {
      const data = pattern.stringConvertion(array);
      ok(data === EXPECTED_STRING, pattern.module + data);
      resolve(data === EXPECTED_STRING);
    });
  });
}

Promise.resolve().then(
  () => verify(verifyPattern['Sample_dummy.txt'])
).then(
//  () => verify(verifyPattern['Dropbox_dummy.txt'])
//).then(
  () => ok(true, 'done')
);
