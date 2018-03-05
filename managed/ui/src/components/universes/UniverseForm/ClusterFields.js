// Copyright (c) YugaByte, Inc.

import React, { Component } from 'react';
import { Row, Col } from 'react-bootstrap';
import { Field, FieldArray } from 'redux-form';
import {browserHistory} from 'react-router';
import _ from 'lodash';
import { isDefinedNotNull, isNonEmptyObject, isNonEmptyString, areIntentsEqual, isEmptyObject,
         isNonEmptyArray, normalizeToPositiveFloat } from 'utils/ObjectUtils';
import { YBTextInputWithLabel, YBSelectWithLabel, YBMultiSelectWithLabel, YBRadioButtonBarWithLabel,
         YBToggle, YBUnControlledNumericInput, YBControlledNumericInputWithLabel } from 'components/common/forms/fields';
import {getPromiseState} from 'utils/PromiseUtils';
import AZSelectorTable from './AZSelectorTable';
import './UniverseForm.scss';
import AZPlacementInfo from './AZPlacementInfo';
import GFlagArrayComponent from './GFlagArrayComponent';
import { IN_DEVELOPMENT_MODE } from '../../../config';
import {getPrimaryCluster, getClusterByType} from "../../../utils/UniverseUtils";

// Default instance types for each cloud provider
const DEFAULT_INSTANCE_TYPE_MAP = {
  'aws': 'c4.2xlarge',
  'gcp': 'n1-standard-1'
};


const initialState = {
  instanceTypeSelected: '',
  azCheckState: true,
  providerSelected: '',
  regionList: [],
  numNodes: 3,
  nodeSetViaAZList: false,
  replicationFactor: 3,
  deviceInfo: {},
  placementInfo: {},
  ybSoftwareVersion: '',
  gflags: {},
  ebsType: 'GP2',
  accessKeyCode: 'yugabyte-default',
  maxNumNodes: -1, // Maximum Number of nodes currently in use OnPrem case
  useSpotPrice: IN_DEVELOPMENT_MODE,
  spotPrice: normalizeToPositiveFloat('0.00'),
  gettingSuggestedSpotPrice: false
};


export default class ClusterFields extends Component {

  constructor(props) {
    super(props);
    this.providerChanged = this.providerChanged.bind(this);
    this.numNodesChanged = this.numNodesChanged.bind(this);
    this.instanceTypeChanged = this.instanceTypeChanged.bind(this);
    this.regionListChanged = this.regionListChanged.bind(this);
    this.getCurrentProvider = this.getCurrentProvider.bind(this);
    this.configureUniverseNodeList = this.configureUniverseNodeList.bind(this);
    this.handleUniverseConfigure = this.handleUniverseConfigure.bind(this);
    this.getSuggestedSpotPrice = this.getSuggestedSpotPrice.bind(this);
    this.ebsTypeChanged = this.ebsTypeChanged.bind(this);
    this.numVolumesChanged = this.numVolumesChanged.bind(this);
    this.volumeSizeChanged = this.volumeSizeChanged.bind(this);
    this.diskIopsChanged = this.diskIopsChanged.bind(this);
    this.setDeviceInfo = this.setDeviceInfo.bind(this);
    this.toggleSpotPrice = this.toggleSpotPrice.bind(this);
    this.toggleAssignPublicIP = this.toggleAssignPublicIP.bind(this);
    this.numNodesChangedViaAzList = this.numNodesChangedViaAzList.bind(this);
    this.replicationFactorChanged = this.replicationFactorChanged.bind(this);
    this.softwareVersionChanged = this.softwareVersionChanged.bind(this);
    this.accessKeyChanged = this.accessKeyChanged.bind(this);
    this.hasFieldChanged = this.hasFieldChanged.bind(this);
    this.getCurrentUserIntent = this.getCurrentUserIntent.bind(this);
    this.state = initialState;
  }

  componentWillMount() {
    const {formValues, clusterType, updateFormField} = this.props;
    if (isNonEmptyArray(this.props.softwareVersions) && !isNonEmptyString(this.state.ybSoftwareVersion)) {
      this.setState({ybSoftwareVersion: this.props.softwareVersions[0]});
      updateFormField(`${clusterType}.ybSoftwareVersion`, this.props.softwareVersions[0]);
    }

    if (this.props.type === "Edit") {
      const {universe: {currentUniverse: {data: {universeDetails}}}} = this.props;
      const primaryCluster = getPrimaryCluster(universeDetails.clusters);
      const userIntent = primaryCluster && primaryCluster.userIntent;
      const providerUUID = userIntent && userIntent.provider;
      if (userIntent && providerUUID) {
        const ebsType = (userIntent.deviceInfo === null) ? null : userIntent.deviceInfo.ebsType;
        this.setState({
          providerSelected: providerUUID,
          instanceTypeSelected: userIntent.instanceType,
          numNodes: userIntent.numNodes,
          replicationFactor: userIntent.replicationFactor,
          ybSoftwareVersion: userIntent.ybSoftwareVersion,
          accessKeyCode: userIntent.accessKeyCode,
          deviceInfo: userIntent.deviceInfo,
          ebsType: ebsType,
          regionList: userIntent.regionList,
          volumeType: (ebsType === null) ? "SSD" : "EBS",
          useSpotPrice: parseFloat(userIntent.spotPrice) > 0.0,
          spotPrice: userIntent.spotPrice
        });
      }

      this.props.getRegionListItems(providerUUID);
      this.props.getInstanceTypeListItems(providerUUID);
      if (primaryCluster.userIntent.providerType === "onprem") {
        this.props.fetchNodeInstanceList(providerUUID);
      }
      // If Edit Case Set Initial Configuration
      this.props.getExistingUniverseConfiguration(universeDetails);
    } else {
      // Set Default form values for numNodes and replicationFactor
      if (isEmptyObject(formValues[clusterType]) || isNonEmptyString(formValues[clusterType].numNodes)) {
        updateFormField(`${clusterType}.numNodes`, 3);
      }

      // Replication-Factor
      if (isEmptyObject(formValues[clusterType]) || isNonEmptyString(formValues[clusterType].replicationFactor)) {
        if (formValues[clusterType] && formValues[clusterType].numNodes) {
          updateFormField(`${clusterType}.replicationFactor`, 3);
        } else {
          updateFormField(`${clusterType}.replicationFactor`, 3);
        }
      }
    }

    if (isNonEmptyObject(formValues[clusterType]) && clusterType === "primary") {
      const primaryCluster = formValues[clusterType];
      if (isNonEmptyArray(primaryCluster.regionList)) {
        this.configureUniverseNodeList();
      }
    }

    if (isNonEmptyObject(formValues[clusterType]) && isNonEmptyString(formValues[clusterType].provider)) {
      this.props.getInstanceTypeListItems(formValues[clusterType].provider);
      this.props.getRegionListItems(formValues[clusterType].provider);
      this.setState({
        instanceTypeSelected: formValues[clusterType].instanceTypeSelected,
      });
      if (formValues[clusterType].spotPrice && formValues[clusterType].spotPrice > 0) {
        this.setState({useSpotPrice: true, spotPrice: formValues[clusterType].spotPrice});
      } else {
        this.setState({useSpotPrice: false, spotPrice: 0.0});
      }
      if (formValues[clusterType].assignPublicIP) {
        this.setState({assignPublicIP: formValues[clusterType].assignPublicIP});
      }
    }
  }

  componentWillReceiveProps(nextProps) {
    const {universe: {currentUniverse}, cloud: {nodeInstanceList, instanceTypes, suggestedSpotPrice}, clusterType, formValues, updateFormField} = nextProps;

    const currentFormValues = formValues[clusterType];
    let providerSelected = this.state.providerSelected;
    if (isNonEmptyObject(currentFormValues) && isNonEmptyString(currentFormValues.provider)) {
      providerSelected = currentFormValues.provider;
    }

    if (nextProps.cloud.instanceTypes.data !== this.props.cloud.instanceTypes.data
      && isNonEmptyArray(nextProps.cloud.instanceTypes.data) && providerSelected) {

      if (nextProps.type !== "Edit") {
        let instanceTypeSelected = null;
        const currentProviderCode = this.getCurrentProvider(providerSelected).code;
        instanceTypeSelected = DEFAULT_INSTANCE_TYPE_MAP[currentProviderCode];
        // If we have the default instance type in the cloud instance types then we
        // use it, otherwise we pick the first one in the list and use it.
        const hasInstanceType = instanceTypes.data.find((it) => {
          return it.providerCode === currentProviderCode && it.instanceTypeCode === instanceTypeSelected;
        });
        if (!hasInstanceType) {
          instanceTypeSelected = instanceTypes.data[0].instanceTypeCode;
        }

        const instanceTypeSelectedData = instanceTypes.data.find(function (item) {
          return item.instanceTypeCode === formValues[clusterType].instanceType;
        });

        if (isNonEmptyObject(instanceTypeSelectedData)) {
          instanceTypeSelected = formValues[clusterType].instanceType;
        }

        this.props.updateFormField(`${clusterType}.instanceType`, instanceTypeSelected);
        this.setState({instanceTypeSelected: instanceTypeSelected});
        this.setDeviceInfo(instanceTypeSelected, instanceTypes.data);
      };
    }

    // Set default ebsType once API call has completed
    if (isNonEmptyArray(nextProps.cloud.ebsTypes) && !isNonEmptyArray(this.props.cloud.ebsTypes)) {
      this.props.updateFormField(`${clusterType}.ebsType`, 'GP2');
      this.setState({"ebsType": "GP2"});
    }

    if (isNonEmptyArray(nextProps.softwareVersions) && isNonEmptyObject(this.props.formValues[clusterType]) && !isNonEmptyString(this.props.formValues[clusterType].ybSoftwareVersion)) {
      this.setState({ybSoftwareVersion: nextProps.softwareVersions[0]});
      this.props.updateFormField(`${clusterType}.ybSoftwareVersion`, nextProps.softwareVersions[0]);
    }

    // Set spot price
    const currentPromiseState = getPromiseState(this.props.cloud.suggestedSpotPrice);
    const nextPromiseState = getPromiseState(suggestedSpotPrice);
    if (currentPromiseState.isLoading()) {
      if (nextPromiseState.isSuccess()) {
        this.setState({
          spotPrice: normalizeToPositiveFloat(suggestedSpotPrice.data.toString()),
          useSpotPrice: true,
          gettingSuggestedSpotPrice: false
        });
        updateFormField(`${clusterType}.spotPrice`, normalizeToPositiveFloat(suggestedSpotPrice.data.toString()));
        updateFormField(`${clusterType}.useSpotPrice`, true);
      } else if (nextPromiseState.isError()) {
        this.setState({
          spotPrice: normalizeToPositiveFloat('0.00'),
          useSpotPrice: false,
          gettingSuggestedSpotPrice: false
        });
        updateFormField(`${clusterType}.spotPrice`, normalizeToPositiveFloat('0.00'));
        updateFormField(`${clusterType}.useSpotPrice`, false);
      }
    }

    // Form Actions on Create Universe Success
    if (getPromiseState(this.props.universe.createUniverse).isLoading() && getPromiseState(nextProps.universe.createUniverse).isSuccess()) {
      this.props.reset();
      this.props.fetchUniverseMetadata();
      this.props.fetchCustomerTasks();
      if (this.context.prevPath) {
        browserHistory.push(this.context.prevPath);
      } else {
        browserHistory.push("/universes");
      }
    }
    // Form Actions on Edit Universe Success
    if (getPromiseState(this.props.universe.editUniverse).isLoading() && getPromiseState(nextProps.universe.editUniverse).isSuccess()) {
      this.props.fetchCurrentUniverse(currentUniverse.data.universeUUID);
      this.props.fetchUniverseMetadata();
      this.props.fetchCustomerTasks();
      this.props.fetchUniverseTasks(currentUniverse.data.universeUUID);
      browserHistory.push(this.props.location.pathname);
    }
    // Form Actions on Configure Universe Success

    if (getPromiseState(this.props.universe.universeConfigTemplate).isLoading() && getPromiseState(nextProps.universe.universeConfigTemplate).isSuccess()) {
      this.props.fetchUniverseResources(nextProps.universe.universeConfigTemplate.data);
    }
    // If nodeInstanceList changes, fetch number of available nodes
    if (getPromiseState(nodeInstanceList).isSuccess() && getPromiseState(this.props.cloud.nodeInstanceList).isLoading()) {
      let numNodesAvailable = nodeInstanceList.data.reduce(function (acc, val) {
        if (!val.inUse) {
          acc++;
        }
        return acc;
      }, 0);
      // Add Existing nodes in Universe userIntent to available nodes for calculation in case of Edit
      if (this.props.type === "Edit") {
        let cluster = getClusterByType(currentUniverse.data.universeDetails.clusters, clusterType);
        if (isDefinedNotNull(cluster)) {
          numNodesAvailable += cluster.userIntent.numNodes;
        }
      }
      this.setState({maxNumNodes: numNodesAvailable});
    }
  }

  componentDidUpdate(prevProps, prevState) {
    const {universe: {currentUniverse}, formValues, clusterType} = this.props;
    let currentProviderUUID = this.state.providerSelected;
    const self = this;

    if (isNonEmptyObject(formValues[clusterType]) && isNonEmptyString(formValues[clusterType].provider)) {
      currentProviderUUID = formValues[clusterType].provider;
    }
    const currentProvider = this.getCurrentProvider(currentProviderUUID);
    const hasSpotPriceChanged = function() {
      if (formValues[clusterType] && prevProps.formValues[clusterType]) {
        return formValues[clusterType].spotPrice !== prevProps.formValues[clusterType].spotPrice;
      } else {
        return false;
      }
    };

    const configureIntentValid = function() {
      return (!_.isEqual(self.state, prevState) || hasSpotPriceChanged()) &&
        isNonEmptyObject(currentProvider) &&
        (prevState.maxNumNodes !== -1 || currentProvider.code !== "onprem") &&
        !self.state.gettingSuggestedSpotPrice && (!self.state.useSpotPrice || (self.state.useSpotPrice && formValues[clusterType].spotPrice > 0))
        &&
        ((currentProvider.code === "onprem" &&
        self.state.numNodes <= self.state.maxNumNodes) || (currentProvider.code !== "onprem")) &&
        self.state.numNodes >= self.state.replicationFactor &&
        !self.state.nodeSetViaAZList;
    };

    // Fire Configure only iff either provider is not on-prem or maxNumNodes is not -1 if on-prem
    if (configureIntentValid()) {
      if (isNonEmptyObject(currentUniverse.data)) {
        if (this.hasFieldChanged()) {
          this.configureUniverseNodeList();
        } else {
          const placementStatusObject = {
            error: {
              type: "noFieldsChanged",
              numNodes: this.state.numNodes,
              maxNumNodes: this.state.maxNumNodes
            }
          };
          this.props.setPlacementStatus(placementStatusObject);
        }
      } else {
        this.configureUniverseNodeList();
      }
    } else if (isNonEmptyArray(this.state.regionList) &&
      currentProvider.code === "onprem" && this.state.instanceTypeSelected &&
      this.state.numNodes > this.state.maxNumNodes) {

      const placementStatusObject = {
        error: {
          type: "notEnoughNodesConfigured",
          numNodes: this.state.numNodes,
          maxNumNodes: this.state.maxNumNodes
        }
      };
      this.props.setPlacementStatus(placementStatusObject);
    }
  }


  numNodesChangedViaAzList(value) {
    this.setState({nodeSetViaAZList: true, numNodes: value});
  }

  setDeviceInfo(instanceTypeCode, instanceTypeList) {
    const {updateFormField, clusterType} = this.props;
    const instanceTypeSelectedData = instanceTypeList.find(function (item) {
      return item.instanceTypeCode === instanceTypeCode;
    });
    const volumesList = instanceTypeSelectedData.instanceTypeDetails.volumeDetailsList;
    const volumeDetail = volumesList[0];
    let mountPoints = null;
    if (instanceTypeSelectedData.providerCode === "onprem") {
      mountPoints = instanceTypeSelectedData.instanceTypeDetails.volumeDetailsList.map(function (item) {
        return item.mountPath;
      }).join(",");
    }
    if (volumeDetail) {
      const deviceInfo = {
        volumeSize: volumeDetail.volumeSizeGB,
        numVolumes: volumesList.length,
        mountPoints: mountPoints,
        ebsType: volumeDetail.volumeType === "EBS" ? "GP2" : null,
        diskIops: null
      };
      updateFormField(`${clusterType}.volumeSize`, volumeDetail.volumeSizeGB);
      updateFormField(`${clusterType}.numVolumes`, volumesList.length);
      updateFormField(`${clusterType}.diskIops`, null);
      updateFormField(`${clusterType}.ebsType`, volumeDetail.volumeType === "EBS" ? "GP2" : null);
      this.setState({nodeSetViaAZList: false, deviceInfo: deviceInfo, volumeType: volumeDetail.volumeType});
    }
  }

  getCurrentUserIntent = () => {
    const {formValues, clusterType} = this.props;
    if (formValues[clusterType]) {
      return {
        universeName: formValues[clusterType].universeName,
        numNodes: formValues[clusterType].numNodes,
        provider: formValues[clusterType].provider,
        providerType: this.getCurrentProvider(formValues[clusterType].provider).code,
        regionList: formValues[clusterType].regionList.map((a)=>(a.value)),
        instanceType: formValues[clusterType].instanceType,
        ybSoftwareVersion: formValues[clusterType].ybSoftwareVersion,
        replicationFactor: formValues[clusterType].replicationFactor,
        deviceInfo: {
          volumeSize: formValues[clusterType].volumeSize,
          numVolumes: formValues[clusterType].numVolumes,
          diskIops: formValues[clusterType].diskIops,
          mountPoints: formValues[clusterType].mountPoints,
          ebsTypes: formValues[clusterType].ebsTypes
        },
        accessKeyCode: formValues[clusterType].accessKeyCode,
        gflags: formValues[clusterType].gflags,
        spotPrice: formValues[clusterType].spotPrice
      };
    }
  };

  softwareVersionChanged(value) {
    const {updateFormField, clusterType} = this.props;
    this.setState({ybSoftwareVersion: value});
    updateFormField(`${clusterType}.ybSoftwareVersion`, value);
  }

  ebsTypeChanged(ebsValue) {
    const {updateFormField, clusterType} = this.props;
    const currentDeviceInfo = _.clone(this.state.deviceInfo);
    currentDeviceInfo.ebsType = ebsValue;
    if (currentDeviceInfo.ebsType === "IO1" && currentDeviceInfo.diskIops == null) {
      currentDeviceInfo.diskIops = 1000;
      updateFormField(`${clusterType}.diskIops`, 1000);
    } else {
      currentDeviceInfo.diskIops = null;
    }
    updateFormField(`${clusterType}.ebsType`, ebsValue);
    this.setState({deviceInfo: currentDeviceInfo, ebsType: ebsValue});
  }

  numVolumesChanged(val) {
    const {updateFormField, clusterType} = this.props;
    updateFormField(`${clusterType}.numVolumes`, val);
    this.setState({deviceInfo: {...this.state.deviceInfo, numVolumes: val}});
  }

  volumeSizeChanged(val) {
    const {updateFormField, clusterType} = this.props;
    updateFormField(`${clusterType}.volumeSize`, val);
    this.setState({deviceInfo: {...this.state.deviceInfo, volumeSize: val}});
  }

  diskIopsChanged(val) {
    const {updateFormField, clusterType} = this.props;
    updateFormField(`${clusterType}.diskIops`, val);
    if (this.state.deviceInfo.ebsType === "IO1") {
      this.setState({deviceInfo: {...this.state.deviceInfo, diskIops: val}});
    }
  }

  toggleSpotPrice(event) {
    const {updateFormField, clusterType} = this.props;
    const nextState = {useSpotPrice: event.target.checked};
    if (event.target.checked) {
      this.getSuggestedSpotPrice(this.state.instanceTypeSelected, this.state.regionList);
    } else {
      nextState['spotPrice'] = initialState.spotPrice;
      this.props.resetSuggestedSpotPrice();
      updateFormField(`${clusterType}.spotPrice`, normalizeToPositiveFloat('0.00'));
    }
    this.setState(nextState);
    updateFormField(`${clusterType}.useSpotPrice`, event.target.checked);
  }

  toggleAssignPublicIP(event) {
    const {updateFormField, clusterType} = this.props;
    updateFormField(`${clusterType}.assignPublicIP`, event.target.checked);
    this.setState({assignPublicIP: event.target.checked});
  }

  spotPriceChanged(val, normalize) {
    const {updateFormField, clusterType} = this.props;
    this.setState({spotPrice: normalize ? normalizeToPositiveFloat(val) : val});
    if (normalize) {
      this.setState({spotPrice: normalizeToPositiveFloat(val)});
      updateFormField(`${clusterType}.spotPrice`, normalizeToPositiveFloat(val));
    } else {
      this.setState({spotPrice: val});
      updateFormField(`${clusterType}.spotPrice`, val);
    }
  }

  replicationFactorChanged = value => {
    const {updateFormField, clusterType} = this.props;
    const self = this;
    if (isEmptyObject(this.props.universe.currentUniverse.data)) {
      this.setState({nodeSetViaAZList: false, replicationFactor: value}, function () {
        if (self.state.numNodes <= value) {
          self.setState({numNodes: value});
        }
      });
    }
    updateFormField(`${clusterType}.replicationFactor`, value);
  };

  hasFieldChanged = () => {
    const {universe: {currentUniverse}} = this.props;
    if (isEmptyObject(currentUniverse.data) || isEmptyObject(currentUniverse.data.universeDetails)) {
      return true;
    }
    const primaryCluster = getPrimaryCluster(currentUniverse.data.universeDetails.clusters);
    const existingIntent = isNonEmptyObject(primaryCluster) ?
      _.clone(primaryCluster.userIntent, true) : null;
    const currentIntent = this.getCurrentUserIntent();
    return !areIntentsEqual(existingIntent, currentIntent);
  };

  handleUniverseConfigure(universeTaskParams) {
    const {universe: {currentUniverse}, formValues, clusterType} = this.props;
    const primaryCluster = getPrimaryCluster(universeTaskParams.clusters);
    if (!isNonEmptyObject(primaryCluster)) return;
    const instanceType = formValues[clusterType].instanceType;
    const regionList = formValues[clusterType].regionList;
    const verifyIntentConditions = function() {
      return isNonEmptyArray(regionList) && isNonEmptyString(instanceType);
    };

    if (verifyIntentConditions() ) {
      if (isNonEmptyObject(currentUniverse.data) && isNonEmptyObject(currentUniverse.data.universeDetails)) {
        const prevPrimaryCluster = getPrimaryCluster(currentUniverse.data.universeDetails.clusters);
        const nextPrimaryCluster = getPrimaryCluster(universeTaskParams.clusters);
        if (isNonEmptyObject(prevPrimaryCluster) && isNonEmptyObject(nextPrimaryCluster) &&
          areIntentsEqual(prevPrimaryCluster.userIntent, nextPrimaryCluster.userIntent)) {
          this.props.getExistingUniverseConfiguration(currentUniverse.data.universeDetails);
        } else {
          this.props.submitConfigureUniverse(universeTaskParams);
        }
      } else {
        this.props.submitConfigureUniverse(universeTaskParams);
      }
    }
  }

  configureUniverseNodeList() {
    const {universe: {universeConfigTemplate, currentUniverse}, formValues, clusterType} = this.props;

    let universeTaskParams = {};
    if (isNonEmptyObject(universeConfigTemplate.data)) {
      universeTaskParams = _.clone(universeConfigTemplate.data, true);
    }
    if (isNonEmptyObject(currentUniverse.data)) {
      universeTaskParams.universeUUID = currentUniverse.data.universeUUID;
      universeTaskParams.expectedUniverseVersion = currentUniverse.data.version;
    }
    const userIntent = {
      universeName: formValues[clusterType].universeName,
      provider: formValues[clusterType].provider,
      regionList: formValues[clusterType].regionList && formValues[clusterType].regionList.map(function (item) {
        return item.value;
      }),
      assignPublicIP: formValues[clusterType].assignPublicIP,
      numNodes: formValues[clusterType].numNodes,
      instanceType: formValues[clusterType].instanceType,
      ybSoftwareVersion: formValues[clusterType].ybSoftwareVersion,
      replicationFactor: formValues[clusterType].replicationFactor,
      deviceInfo: {
        volumeSize: formValues[clusterType].volumeSize,
        numVolumes: formValues[clusterType].numVolumes,
        mountPoints: formValues[clusterType].mountPoints,
        ebsType: formValues[clusterType].ebsType,
        diskIops: formValues[clusterType].diskIops
      },
      accessKeyCode: formValues[clusterType].accessKeyCode,
      spotPrice: formValues[clusterType].spotPrice
    };

    if (isNonEmptyObject(formValues.masterGFlags)) {
      userIntent["masterGFlags"] = formValues.masterGFlags;
    }
    if (isNonEmptyObject(formValues.tserverGFlags)) {
      userIntent["tserverGFlags"] = formValues.tserverGFlags;
    }
    userIntent.assignPublicIP = formValues.assignPublicIP;

    this.props.cloud.providers.data.forEach(function (providerItem) {
      if (providerItem.uuid === userIntent.provider) {
        userIntent.providerType = providerItem.code;
      }
    });

    userIntent.regionList = formValues[clusterType].regionList.map(item => item.value);
    const primaryCluster = getPrimaryCluster(universeTaskParams.clusters);
    if (isDefinedNotNull(primaryCluster)) {
      primaryCluster.userIntent = userIntent;
    } else {
      universeTaskParams.clusters = [{clusterType: 'PRIMARY', userIntent: userIntent}];
    }
    universeTaskParams.currentClusterType = clusterType;
    this.handleUniverseConfigure(universeTaskParams);
  }

  numNodesChanged(value) {
    const {updateFormField, clusterType} = this.props;
    this.setState({numNodes: value});
    updateFormField(`${clusterType}.numNodes`, value);
  }

  getCurrentProvider(providerUUID) {
    return this.props.cloud.providers.data.find((provider) => provider.uuid === providerUUID);
  }

  providerChanged(value) {
    const {updateFormField, clusterType} = this.props;
    const providerUUID = value;
    if (isEmptyObject(this.props.universe.currentUniverse.data)) {
      this.props.updateFormField(`${clusterType}.regionList`, []);
      //If we have accesskeys for a current selected provider we set that in the state or we fallback to default value.
      let defaultAccessKeyCode = initialState.accessKeyCode;
      if (isNonEmptyArray(this.props.accessKeys.data)) {
        const providerAccessKeys = this.props.accessKeys.data.filter((key) => key.idKey.providerUUID === value);
        if (isNonEmptyArray(providerAccessKeys)) {
          defaultAccessKeyCode = providerAccessKeys[0].idKey.keyCode;
        }
      }
      updateFormField(`${clusterType}.accessKeyCode`, defaultAccessKeyCode);
      this.setState({nodeSetViaAZList: false, regionList: [], providerSelected: providerUUID,
        deviceInfo: {}, accessKeyCode: defaultAccessKeyCode});
      this.props.getRegionListItems(providerUUID, true);
      this.props.getInstanceTypeListItems(providerUUID);
    }
    const currentProviderData = this.getCurrentProvider(value);

    if (currentProviderData && currentProviderData.code === "onprem") {
      this.props.fetchNodeInstanceList(value);
    }
  }

  accessKeyChanged(event) {
    const {clusterType} = this.props;
    this.props.updateFormField(`${clusterType}.accessKeyCode`, event.target.value);
  }

  instanceTypeChanged(value) {
    const {updateFormField, clusterType} = this.props;
    const instanceTypeValue = value;
    updateFormField(`${clusterType}.instanceType`, instanceTypeValue);
    this.setState({instanceTypeSelected: instanceTypeValue});

    this.setDeviceInfo(instanceTypeValue, this.props.cloud.instanceTypes.data);
    if (this.state.useSpotPrice) {
      this.getSuggestedSpotPrice(instanceTypeValue, this.state.regionList);
    } else {
      this.props.resetSuggestedSpotPrice();
    }
  }

  regionListChanged(value) {
    const {formValues, clusterType, updateFormField, cloud:{providers}} = this.props;
    this.setState({nodeSetViaAZList: false, regionList: value});
    if (this.state.useSpotPrice) {
      this.getSuggestedSpotPrice(this.state.instanceTypeSelected, value);
    } else {
      this.props.resetSuggestedSpotPrice();
    }
    const currentProvider = providers.data.find((a)=>(a.uuid === formValues[clusterType].provider));
    if (!isNonEmptyString(formValues[clusterType].instanceType)) {
      updateFormField(`${clusterType}.instanceType`, DEFAULT_INSTANCE_TYPE_MAP[currentProvider.code]);
    }
  }

  getSuggestedSpotPrice(instanceType, regions) {
    const currentProvider = this.getCurrentProvider(this.state.providerSelected);
    const regionUUIDs = regions.map(region => region.value);
    if (this.props.type !== "Edit" && isDefinedNotNull(currentProvider) && currentProvider.code === "aws"
      && isNonEmptyArray(regionUUIDs)) {
      this.props.getSuggestedSpotPrice(this.state.providerSelected, instanceType, regionUUIDs);
      this.setState({gettingSuggestedSpotPrice: true});
    }
  }

  render() {
    const {clusterType, cloud, softwareVersions, accessKeys, universe, cloud: {suggestedSpotPrice}, formValues} = this.props;
    const self = this;
    let gflagArray = <span/>;
    let universeProviderList = [];
    let currentProviderCode = "";

    let currentProviderUUID = self.state.providerSelected;
    if (formValues[clusterType] && formValues[clusterType].provider) {
      currentProviderUUID = formValues[clusterType].provider;
    }

    // Populate the cloud provider list
    if (isNonEmptyArray(cloud.providers.data)) {
      universeProviderList = cloud.providers.data.map(function(providerItem, idx) {
        if (providerItem.uuid === currentProviderUUID) {
          currentProviderCode = providerItem.code;
        }
        return (
          <option key={providerItem.uuid} value={providerItem.uuid}>
            {providerItem.name}
          </option>
        );
      });
    }

    // Spot price and EBS types
    let ebsTypeSelector = <span/>;
    let deviceDetail = null;
    let iopsField = <span/>;
    function volumeTypeFormat(num) {
      return num + ' GB';
    }
    const ebsTypesList =
      cloud.ebsTypes && cloud.ebsTypes.map(function (ebsType, idx) {
        return <option key={ebsType} value={ebsType}>{ebsType}</option>;
      });
    const isFieldReadOnly = isNonEmptyObject(universe.currentUniverse.data) && this.props.type === "Edit";
    const deviceInfo = this.state.deviceInfo;

    if (isNonEmptyObject(formValues[clusterType])) {
      const currentCluster = formValues[clusterType];
      if (isNonEmptyString(currentCluster.numVolumes)) {
        deviceInfo["numVolumes"] = currentCluster.numVolumes;
      }
      if (isNonEmptyString(currentCluster.volumeSize)) {
        deviceInfo["volumeSize"] = currentCluster.volumeSize;
      }
      if (isNonEmptyString(currentCluster.diskIops)) {
        deviceInfo["diskIops"] = currentCluster.diskIops;
      }
      if (isNonEmptyObject(currentCluster.ebsType)) {
        deviceInfo["ebsType"] = currentCluster.ebsType;
      }
    }

    if (isNonEmptyObject(deviceInfo)) {
      if (self.state.volumeType === 'EBS') {
        if (deviceInfo.ebsType === 'IO1') {
          iopsField = (
            <span className="volume-info form-group-shrinked">
              <label className="form-item-label">Provisioned IOPS</label>
              <span className="volume-info-field volume-info-iops">
                <Field name={`${clusterType}.diskIops`} component={YBUnControlledNumericInput} label="Provisioned IOPS"
                       onInputChanged={self.diskIopsChanged}/>
              </span>
            </span>
          );
        }
        deviceDetail = (
          <span className="volume-info">
            <span className="volume-info-field volume-info-count">
              <Field name={`${clusterType}.numVolumes`} component={YBUnControlledNumericInput}
                     label="Number of Volumes" onInputChanged={self.numVolumesChanged}/>
            </span>
            &times;
            <span className="volume-info-field volume-info-size">
              <Field name={`${clusterType}.volumeSize`} component={YBUnControlledNumericInput} label="Volume Size"
                     valueFormat={volumeTypeFormat} onInputChanged={self.volumeSizeChanged}/>
            </span>
          </span>
        );
        ebsTypeSelector = (
          <span className="volume-info form-group-shrinked">
            <Field name={`${clusterType}.ebsType`} component={YBSelectWithLabel} options={ebsTypesList}
                   label="EBS Type" onInputChanged={self.ebsTypeChanged}/>
          </span>
        );
      } else if (self.state.volumeType === 'SSD') {
        let mountPointsDetail = <span />;
        if (self.state.deviceInfo.mountPoints != null) {
          mountPointsDetail = (
            <span>
              <label className="form-item-label">Mount Points</label>
              {self.state.deviceInfo.mountPoints}
            </span>
          );
        }
        deviceDetail = (
          <span className="volume-info">
            {deviceInfo.numVolumes} &times;&nbsp;
            {volumeTypeFormat(deviceInfo.volumeSize)} {deviceInfo.volumeType} &nbsp;
            {mountPointsDetail}
          </span>
        );
      }
    }

    let spotPriceToggle = <span />;
    let spotPriceField = <span />;
    let assignPublicIP = <span />;
    const currentProvider = this.getCurrentProvider(currentProviderUUID);

    if (isDefinedNotNull(currentProvider) && currentProvider.code === "aws") {
      assignPublicIP = (
        <Field name={`${clusterType}.assignPublicIP`}
               component={YBToggle}
               checkedVal={this.state.assignPublicIP}
               onToggle={this.toggleAssignPublicIP}
               label="Assign Public IP"
               subLabel="Whether or not to assign a public IP."/>
      );
      if (this.state.gettingSuggestedSpotPrice) {
        spotPriceField = (
          <div className="form-group">
            <label className="form-item-label">Spot Price (Per Hour)</label>
            <div className="extra-info-field text-center">Loading suggested spot price...</div>
          </div>
        );
      } else if (!this.state.gettingSuggestedSpotPrice && this.state.useSpotPrice) {
        spotPriceField = (
          <Field name={`${clusterType}.spotPrice`} type="text"
                 component={YBTextInputWithLabel}
                 label="Spot Price (Per Hour)"
                 isReadOnly={isFieldReadOnly || !this.state.useSpotPrice}
                 normalizeOnBlur={(val) => this.spotPriceChanged(val, true)}
                 initValue={this.state.spotPrice.toString()}
                 onValueChanged={(val) => this.spotPriceChanged(val, false)}/>
        );
      } else if (getPromiseState(suggestedSpotPrice).isError()) {
        spotPriceField = (
          <div className="form-group">
            <label className="form-item-label">Spot Price (Per Hour)</label>
            <div className="extra-info-field text-center">Spot pricing not supported for {this.state.instanceTypeSelected} in selected regions.</div>
          </div>
        );
      }

      spotPriceToggle = (
        <Field name={`${clusterType}.useSpotPrice`}
               component={YBToggle}
               label="Use Spot Pricing"
               subLabel="spot pricing is suitable for test environments only, because spot instances might go away any time"
               onToggle={this.toggleSpotPrice}
               checkedVal={this.state.useSpotPrice}
               isReadOnly={isFieldReadOnly || this.state.gettingSuggestedSpotPrice}/>
      );
    }

    // End spot price and EBS types

    universeProviderList.unshift(<option key="" value=""></option>);

    const universeRegionList =
      cloud.regions.data && cloud.regions.data.map(function (regionItem) {
        return {value: regionItem.uuid, label: regionItem.name};
      });

    let universeInstanceTypeList = <option/>;

    if (currentProviderCode === "aws") {
      const optGroups = this.props.cloud.instanceTypes && this.props.cloud.instanceTypes.data.reduce(function(groups, it) {
        const prefix = it.instanceTypeCode.substr(0, it.instanceTypeCode.indexOf("."));
        groups[prefix] ? groups[prefix].push(it.instanceTypeCode): groups[prefix] = [it.instanceTypeCode];
        return groups;
      }, {});
      if (isNonEmptyObject(optGroups)) {
        universeInstanceTypeList = Object.keys(optGroups).map(function(key, idx){
          return(
            <optgroup label={`${key.toUpperCase()} type instances`} key={key+idx}>
              {
                optGroups[key].sort((a, b) => (/\d+(?!\.)/.exec(a) - /\d+(?!\.)/.exec(b)))
                  .map((item, arrIdx) => (
                    <option key={idx+arrIdx} value={item}>
                      {item}
                    </option>
                  ))
              }
            </optgroup>
          );
        });
      }
    } else {
      universeInstanceTypeList =
        cloud.instanceTypes.data && cloud.instanceTypes.data.map(function (instanceTypeItem, idx) {
          return (
            <option key={instanceTypeItem.instanceTypeCode}
                    value={instanceTypeItem.instanceTypeCode}>
              {instanceTypeItem.instanceTypeCode}
            </option>
          );
        });
    }

    if (isNonEmptyArray(universeInstanceTypeList)) {
      universeInstanceTypeList.unshift(<option key="" value="">Select</option>);
    }

    let azSelectorTable = <span/>;

    if (clusterType === "primary") {
      gflagArray =
        (<Row>
          <Col md={12}>
            <h4>G-Flags</h4>
          </Col>
          <Col md={6}>
            <FieldArray component={GFlagArrayComponent} name={`${clusterType}.masterGFlags`} flagType="master" operationType="Create" isReadOnly={isFieldReadOnly}/>
          </Col>
          <Col md={6}>
            <FieldArray component={GFlagArrayComponent} name={`${clusterType}.tserverGFlags`} flagType="tserver" operationType="Create" isReadOnly={isFieldReadOnly}/>
          </Col>
        </Row>);


      let placementStatus = <span/>;
      if (self.props.universe.currentPlacementStatus) {
        placementStatus = <AZPlacementInfo placementInfo={self.props.universe.currentPlacementStatus}/>;
      }

      azSelectorTable =
        (<div>
          <AZSelectorTable {...this.props}
                           numNodesChangedViaAzList={this.numNodesChangedViaAzList} minNumNodes={this.state.replicationFactor}
                           maxNumNodes={this.state.maxNumNodes} currentProvider={this.getCurrentProvider(currentProviderUUID)}/>
          {placementStatus}
        </div>);
    }

    const softwareVersionOptions = softwareVersions.map((item, idx) => (
      <option key={idx} value={item}>{item}</option>
    ));


    let accessKeyOptions = <option key={1} value={this.state.accessKeyCode}>{this.state.accessKeyCode}</option>;
    if (_.isObject(accessKeys) && isNonEmptyArray(accessKeys.data)) {
      accessKeyOptions = accessKeys.data.filter((key) => key.idKey.providerUUID === currentProviderUUID)
        .map((item, idx) => (
          <option key={idx} value={item.idKey.keyCode}>
            {item.idKey.keyCode}
          </option>));
    }
    let universeNameField = <span/>;
    if (clusterType === "primary") {
      universeNameField = <Field name={`${clusterType}.universeName`} type="text" component={YBTextInputWithLabel} label="Name" isReadOnly={isFieldReadOnly}/>;
    }

    // Instance Type is read-only if use spot price is selected
    const isInstanceTypeReadOnly = isFieldReadOnly && this.state.useSpotPrice;
    return (
      <div>
        <div className="form-section">
          <Row>
            <Col md={6}>
              <h4 style={{marginBottom: 40}}>Cloud Configuration</h4>
              <div className="form-right-aligned-labels">
                {universeNameField}
                <Field name={`${clusterType}.provider`} type="select" component={YBSelectWithLabel} label="Provider"
                        onInputChanged={this.providerChanged} options={universeProviderList} readOnlySelect={isFieldReadOnly}/>
                <Field name={`${clusterType}.regionList`} component={YBMultiSelectWithLabel} options={universeRegionList}
                       label="Regions" multi={true} selectValChanged={this.regionListChanged} providerSelected={currentProviderUUID}/>
              </div>

              <Row>
                <div className="form-right-aligned-labels">
                  <Col lg={5}>
                    <Field name={`${clusterType}.numNodes`} type="text" component={YBControlledNumericInputWithLabel}
                           label="Nodes" onInputChanged={this.numNodesChanged} onLabelClick={this.numNodesClicked} val={this.state.numNodes}
                           minVal={Number(this.state.replicationFactor)}/>
                  </Col>
                  <Col lg={7} className="button-group-row">
                    <Field name={`${clusterType}.replicationFactor`} type="text" component={YBRadioButtonBarWithLabel} options={[1, 3, 5, 7]}
                           label="Replication Factor" initialValue={this.state.replicationFactor} onSelect={this.replicationFactorChanged} isReadOnly={isFieldReadOnly}/>
                  </Col>
                </div>
              </Row>

            </Col>
            <Col md={6} className={"universe-az-selector-container"}>
              {azSelectorTable}
            </Col>
          </Row>
        </div>
        <div className="form-section">
          <Row>
            <Col md={12}>
              <h4>Instance Configuration</h4>
            </Col>
            <Col sm={12} md={12} lg={6}>
              <div className="form-right-aligned-labels">
                <Field name={`${clusterType}.instanceType`} component={YBSelectWithLabel} label="Instance Type"
                       options={universeInstanceTypeList} onInputChanged={this.instanceTypeChanged} readOnlySelect={isInstanceTypeReadOnly}/>
                {spotPriceToggle}
                {spotPriceField}
                {assignPublicIP}
              </div>
            </Col>
            {deviceDetail &&
            <Col sm={12} md={12} lg={6}>
              <div className="form-right-aligned-labels form-inline-controls">
                <div className="form-group universe-form-instance-info">
                  <label className="form-item-label form-item-label-shrink">Volume Info</label>
                  {deviceDetail}
                </div>
              </div>
              { self.state.deviceInfo.ebsType === 'IO1' &&
              <div className="form-right-aligned-labels form-inline-controls">
                <div className="form-group universe-form-instance-info">
                  {iopsField}
                </div>
              </div>
              }
              <div className="form-right-aligned-labels form-inline-controls">
                <div className="form-group universe-form-instance-info">
                  {ebsTypeSelector}
                </div>
              </div>
            </Col>
            }
          </Row>
        </div>
        <div className="form-section">
          <Row>
            <Col md={12}>
              <h4>Advanced</h4>
            </Col>
            <Col sm={5} md={4}>
              <div className="form-right-aligned-labels">
                <Field name={`${clusterType}.ybSoftwareVersion`} component={YBSelectWithLabel}
                       options={softwareVersionOptions} label="YugaByte Version" onInputChanged={this.softwareVersionChanged} readOnlySelect={isFieldReadOnly}/>
              </div>
            </Col>
            <Col lg={4}>
              <div className="form-right-aligned-labels">
                <Field name={`${clusterType}.accessKeyCode`} type="select" component={YBSelectWithLabel} label="Access Key"
                       onInputChanged={this.accessKeyChanged} options={accessKeyOptions} readOnlySelect={isFieldReadOnly}/>
              </div>
            </Col>
          </Row>
        </div>
        <div className="form-section no-border">
          {gflagArray}
        </div>
      </div>
    );
  }
}