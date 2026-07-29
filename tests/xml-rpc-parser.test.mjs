import assert from 'node:assert/strict';
import test from 'node:test';
import { parseXmlRpcResponse } from '../src/lib/odoo/xml-rpc-parser.ts';

test('parses nested arrays and structs without collapsing to the first integer', () => {
  const response = parseXmlRpcResponse(`<?xml version="1.0"?>
    <methodResponse><params><param><value><array><data>
      <value><struct>
        <member><name>id</name><value><int>6</int></value></member>
        <member><name>name</name><value><string>Commercial Rent &amp; Services</string></value></member>
        <member><name>active</name><value><boolean>1</boolean></value></member>
        <member><name>categ_id</name><value><array><data>
          <value><int>6</int></value><value><string>Commercial Rent</string></value>
        </data></array></value></member>
      </struct></value>
    </data></array></value></param></params></methodResponse>`);

  assert.equal(response.fault, null);
  assert.deepEqual(response.value, [{
    id: 6,
    name: 'Commercial Rent & Services',
    active: true,
    categ_id: [6, 'Commercial Rent'],
  }]);
});

test('preserves false values and empty strings', () => {
  const response = parseXmlRpcResponse(`<?xml version="1.0"?>
    <methodResponse><params><param><value><struct>
      <member><name>ref</name><value><boolean>0</boolean></value></member>
      <member><name>name</name><value><string></string></value></member>
      <member><name>optional</name><value><nil/></value></member>
    </struct></value></param></params></methodResponse>`);

  assert.deepEqual(response.value, { ref: false, name: '', optional: null });
});

test('returns structured faults', () => {
  const response = parseXmlRpcResponse(`<?xml version="1.0"?>
    <methodResponse><fault><value><struct>
      <member><name>faultCode</name><value><int>2</int></value></member>
      <member><name>faultString</name><value><string>Access denied</string></value></member>
    </struct></value></fault></methodResponse>`);

  assert.deepEqual(response.fault, { code: 2, message: 'Access denied' });
});
